import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  advertisingResearchItems,
  advertisingResearchRuns,
  folders,
  keywordMetrics,
  serpSnapshots,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { newId } from "@/lib/ids";
import { assertCan, assertSameWorkspace } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import { getAdvertisingBrandContext } from "@/server/advertising/context";
import {
  parseJson,
  type AdvertisingResearchReport,
  type AdvertisingResearchResultRow,
  type AdvertisingResearchRunView,
} from "@/server/advertising/contracts";
import { suggestAdvertisingKeywords } from "@/server/advertising/ai";
import {
  derivePlaAvailability,
  summarizeResearchOutcomes,
} from "@/server/advertising/research-state";
import { collectKeywordSerp, suggestDomainKeywords } from "@/server/talordata/collect";

const MAX_KEYWORDS = 20;

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueKeywords(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const keyword = normalizeKeyword(raw);
    const key = keyword.toLocaleLowerCase();
    if (!keyword || keyword.length > 100 || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
    if (result.length >= MAX_KEYWORDS) break;
  }
  return result;
}

function runView(row: typeof advertisingResearchRuns.$inferSelect): AdvertisingResearchRunView {
  return {
    id: row.id,
    folderId: row.folderId,
    domain: row.domain,
    countryCode: row.countryCode,
    device: row.device,
    keywords: parseJson<string[]>(row.keywords, []),
    status: row.status,
    totalCount: row.totalCount,
    processedCount: row.processedCount,
    successCount: row.successCount,
    failedCount: row.failedCount,
    currentKeyword: row.currentKeyword,
    errorMessage: row.errorMessage,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function assertFolder(auth: AuthContext, folderId?: string | null): Promise<void> {
  if (!folderId) return;
  const [folder] = await db
    .select({ workspaceId: folders.workspaceId })
    .from(folders)
    .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
    .limit(1);
  assertSameWorkspace(auth, folder, "폴더");
}

export async function enqueueAdvertisingResearch(
  auth: AuthContext,
  input: {
    domain: string;
    folderId?: string | null;
    countryCode?: string;
    device?: "desktop" | "mobile";
    languageCode?: string;
    keywords?: string[];
  },
): Promise<AdvertisingResearchRunView> {
  assertCan(auth, "create");
  const domain = normalizeDomain(input.domain);
  if (!domain || !domain.includes(".")) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인을 입력해 주세요.", {
      fields: { domain: "예: example.com" },
    });
  }
  await assertFolder(auth, input.folderId);

  let keywords = uniqueKeywords(input.keywords ?? []);
  if (keywords.length === 0) {
    const context = await getAdvertisingBrandContext(domain);
    let aiKeywords: string[] = [];
    try {
      aiKeywords = await suggestAdvertisingKeywords(
        domain,
        context,
        input.languageCode ?? (input.countryCode?.toUpperCase() === "KR" ? "ko" : "en"),
      );
    } catch (error) {
      console.warn("[advertising] AI keyword suggestions unavailable", error);
    }
    keywords = uniqueKeywords([...suggestDomainKeywords(domain), ...aiKeywords]);
  }
  if (keywords.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "수집할 키워드를 한 개 이상 입력해 주세요.");
  }

  const id = newId("adr");
  const now = new Date();
  const row: typeof advertisingResearchRuns.$inferInsert = {
    id,
    workspaceId: auth.workspaceId,
    folderId: input.folderId ?? null,
    domain,
    countryCode: (input.countryCode ?? "KR").toUpperCase(),
    device: input.device ?? "desktop",
    keywords: JSON.stringify(keywords),
    totalCount: keywords.length,
    createdBy: auth.userId,
    updatedBy: auth.userId,
    createdAt: now,
    updatedAt: now,
  };
  db.transaction((tx) => {
    tx.insert(advertisingResearchRuns).values(row).run();
    tx.insert(advertisingResearchItems).values(
      keywords.map((keyword) => ({ id: newId("adi"), runId: id, keyword })),
    ).run();
  });
  writeAudit(auth, {
    action: "create",
    entityType: "advertising_research_run",
    entityId: id,
    entityLabel: domain,
    after: { domain, keywords, countryCode: row.countryCode, device: row.device },
  });
  const [created] = await db
    .select()
    .from(advertisingResearchRuns)
    .where(eq(advertisingResearchRuns.id, id));
  return runView(created);
}

export async function executeAdvertisingResearch(auth: AuthContext, runId: string): Promise<AdvertisingResearchRunView> {
  const [run] = await db
    .select()
    .from(advertisingResearchRuns)
    .where(and(eq(advertisingResearchRuns.id, runId), isNull(advertisingResearchRuns.deletedAt)))
    .limit(1);
  assertSameWorkspace(auth, run, "광고 리서치 실행");
  if (run.status === "completed" || run.status === "failed") return runView(run);
  if (run.status === "running") return runView(run);

  const startedAt = new Date();
  const claimed = db
    .update(advertisingResearchRuns)
    .set({ status: "running", startedAt: run.startedAt ?? startedAt, updatedAt: startedAt })
    .where(and(eq(advertisingResearchRuns.id, run.id), eq(advertisingResearchRuns.status, "queued")))
    .run();
  if (claimed.changes !== 1) return getAdvertisingResearchRun(auth, run.id);

  const items = await db
    .select()
    .from(advertisingResearchItems)
    .where(eq(advertisingResearchItems.runId, run.id));
  let processed = items.filter((item) => item.status === "completed" || item.status === "failed").length;
  let succeeded = items.filter((item) => item.status === "completed").length;
  let failed = items.filter((item) => item.status === "failed").length;

  for (const item of items.filter((value) => value.status === "queued" || value.status === "running")) {
    const itemStartedAt = new Date();
    await db
      .update(advertisingResearchItems)
      .set({ status: "running", startedAt: itemStartedAt, errorMessage: null })
      .where(eq(advertisingResearchItems.id, item.id));
    await db
      .update(advertisingResearchRuns)
      .set({ currentKeyword: item.keyword, updatedAt: itemStartedAt })
      .where(eq(advertisingResearchRuns.id, run.id));
    try {
      const collection = await collectKeywordSerp({
        keyword: item.keyword,
        countryCode: run.countryCode,
        device: run.device,
        num: 20,
      });
      const adCount = collection.paid.filter((result) => result.kind === "search_ad").length;
      const shoppingCount = collection.paid.filter((result) => result.kind === "shopping_ad").length;
      await db
        .update(advertisingResearchItems)
        .set({
          status: "completed",
          keywordMetricId: collection.keywordMetricId,
          adCount,
          shoppingCount,
          shoppingAvailability:
            collection.shoppingAvailability === "unavailable"
              ? "unavailable"
              : shoppingCount > 0
                ? "available"
                : "no_results",
          fromCache: collection.fromCache,
          capturedAt: collection.capturedAt,
          completedAt: new Date(),
        })
        .where(eq(advertisingResearchItems.id, item.id));
      succeeded += 1;
    } catch (error) {
      failed += 1;
      await db
        .update(advertisingResearchItems)
        .set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "수집에 실패했습니다.",
          completedAt: new Date(),
        })
        .where(eq(advertisingResearchItems.id, item.id));
    }
    processed += 1;
    await db
      .update(advertisingResearchRuns)
      .set({ processedCount: processed, successCount: succeeded, failedCount: failed, updatedAt: new Date() })
      .where(eq(advertisingResearchRuns.id, run.id));
  }

  const completedAt = new Date();
  const status = succeeded > 0 ? "completed" : "failed";
  const errorMessage = status === "failed" ? "모든 키워드 수집에 실패했습니다." : null;
  await db
    .update(advertisingResearchRuns)
    .set({
      status,
      currentKeyword: null,
      processedCount: processed,
      successCount: succeeded,
      failedCount: failed,
      errorMessage,
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(advertisingResearchRuns.id, run.id));
  const [completed] = await db
    .select()
    .from(advertisingResearchRuns)
    .where(eq(advertisingResearchRuns.id, run.id));
  return runView(completed);
}

export async function getAdvertisingResearchRun(
  auth: AuthContext,
  runId: string,
): Promise<AdvertisingResearchRunView> {
  const [run] = await db
    .select()
    .from(advertisingResearchRuns)
    .where(and(eq(advertisingResearchRuns.id, runId), isNull(advertisingResearchRuns.deletedAt)))
    .limit(1);
  assertSameWorkspace(auth, run, "광고 리서치 실행");
  return runView(run);
}

export async function listAdvertisingResearchRuns(
  auth: AuthContext,
): Promise<AdvertisingResearchRunView[]> {
  const rows = await db
    .select()
    .from(advertisingResearchRuns)
    .where(and(eq(advertisingResearchRuns.workspaceId, auth.workspaceId), isNull(advertisingResearchRuns.deletedAt)))
    .orderBy(desc(advertisingResearchRuns.createdAt))
    .limit(30);
  return rows.map(runView);
}

function metadata(value: string): Record<string, unknown> {
  return parseJson<Record<string, unknown>>(value, {});
}

export async function getAdvertisingResearchReport(
  auth: AuthContext,
  runId: string,
): Promise<AdvertisingResearchReport> {
  const run = await getAdvertisingResearchRun(auth, runId);
  const items = await db
    .select()
    .from(advertisingResearchItems)
    .where(eq(advertisingResearchItems.runId, runId));
  const metricIds = items.flatMap((item) => (item.keywordMetricId ? [item.keywordMetricId] : []));
  const metrics = metricIds.length
    ? await db.select().from(keywordMetrics).where(inArray(keywordMetrics.id, metricIds))
    : [];
  const metricById = new Map(metrics.map((metric) => [metric.id, metric]));
  const rows: AdvertisingResearchResultRow[] = [];

  for (const item of items) {
    if (!item.keywordMetricId || !item.capturedAt || item.status !== "completed") continue;
    const current = await db
      .select()
      .from(serpSnapshots)
      .where(
        and(
          eq(serpSnapshots.keywordMetricId, item.keywordMetricId),
          eq(serpSnapshots.searchEngine, "google"),
          eq(serpSnapshots.capturedAt, item.capturedAt),
          eq(serpSnapshots.isAd, true),
        ),
      )
      .orderBy(serpSnapshots.position);
    const previousRows = await db
      .select()
      .from(serpSnapshots)
      .where(
        and(
          eq(serpSnapshots.keywordMetricId, item.keywordMetricId),
          eq(serpSnapshots.searchEngine, "google"),
          eq(serpSnapshots.isAd, true),
          lt(serpSnapshots.capturedAt, item.capturedAt),
        ),
      )
      .orderBy(desc(serpSnapshots.capturedAt));
    const previousAt = previousRows[0]?.capturedAt.getTime();
    const previous = new Map(
      previousRows
        .filter((row) => row.capturedAt.getTime() === previousAt)
        .map((row) => [`${row.resultType}:${normalizeDomain(row.domain)}`, row.position]),
    );
    const metric = metricById.get(item.keywordMetricId);
    for (const row of current) {
      const extra = metadata(row.resultMetadata);
      const domain = normalizeDomain(row.domain) || row.domain;
      rows.push({
        keyword: item.keyword,
        resultType: row.resultType === "shopping_ad" ? "shopping_ad" : "search_ad",
        position: row.position,
        previousPosition: previous.get(`${row.resultType}:${domain}`) ?? null,
        domain,
        advertiser: typeof extra.advertiser === "string" ? extra.advertiser : null,
        title: row.title ?? "",
        description: row.description,
        url: row.url,
        placement: row.adPlacement ?? "unknown",
        price: typeof extra.price === "string" ? extra.price : null,
        imageUrl: typeof extra.imageUrl === "string" ? extra.imageUrl : null,
        volume: metric && metric.volume > 0 ? metric.volume : null,
        cpcCents: metric && metric.cpcCents > 0 ? metric.cpcCents : null,
      });
    }
  }
  return {
    run,
    rows,
    coverage: {
      searchAds: rows.filter((row) => row.resultType === "search_ad").length,
      shoppingAds: rows.filter((row) => row.resultType === "shopping_ad").length,
      ...summarizeResearchOutcomes(items),
      plaAvailability: derivePlaAvailability(run.status, items),
    },
  };
}

export async function getLatestAdvertisingResearchReport(
  auth: AuthContext,
  domainInput: string,
): Promise<AdvertisingResearchReport | null> {
  const domain = normalizeDomain(domainInput);
  const [latest] = await db
    .select({ id: advertisingResearchRuns.id })
    .from(advertisingResearchRuns)
    .where(
      and(
        eq(advertisingResearchRuns.workspaceId, auth.workspaceId),
        eq(advertisingResearchRuns.domain, domain),
        eq(advertisingResearchRuns.status, "completed"),
        isNull(advertisingResearchRuns.deletedAt),
      ),
    )
    .orderBy(desc(advertisingResearchRuns.completedAt))
    .limit(1);
  return latest ? getAdvertisingResearchReport(auth, latest.id) : null;
}
