// @TASK NAVER-KI-SVC-03 - NAVER 키워드 캐시·사용량·예산 저장소
// @SPEC user-approved-plan#3-b-data-model-and-provenance
// @TEST src/server/naver-keywords/store.test.ts
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  naverKeywordInsights,
  naverKeywordSnapshots,
  providerCallBudgets,
  publicKeywordUsage,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import type {
  NaverKeywordCount,
  NaverKeywordStat,
} from "@/server/naver-keywords/contracts";
import type {
  PublicKeywordAtomicInput,
  PublicKeywordAtomicResult,
  PublicKeywordUsageRepository,
  PublicKeywordUsageRow,
} from "@/server/naver-keywords/rate-limit";
import {
  NAVER_STALE_MAX_AGE_MS,
  type CachedNaverSection,
  type NaverInsightKind,
  type NaverKeywordServiceStore,
} from "@/server/naver-keywords/service";
import type {
  NaverBudgetProvider,
  ProviderBudgetRepository,
} from "@/server/naver-keywords/execution";

function normalizedKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
}

function storedCount(input: {
  qualifier: "exact" | "lt";
  min: number;
  maxExclusive: number | null;
  display: string;
}): NaverKeywordCount {
  if (input.qualifier === "exact") {
    return {
      relation: "exact",
      min: input.min,
      maxExclusive: input.min + 1,
      value: input.min,
      display: input.display,
    };
  }
  return {
    relation: "lt",
    min: input.min,
    maxExclusive: input.maxExclusive,
    display: input.display,
  };
}

function grouped(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function sumCounts(values: readonly NaverKeywordCount[]): NaverKeywordCount {
  if (values.every((value) => value.relation === "exact")) {
    const total = values.reduce((sum, value) => sum + (value.value ?? value.min), 0);
    return {
      relation: "exact",
      value: total,
      min: total,
      maxExclusive: total + 1,
      display: grouped(total),
    };
  }
  const min = values.reduce((sum, value) => sum + value.min, 0);
  const maxExclusive = values.reduce(
    (sum, value) => sum + (value.relation === "exact"
      ? (value.value ?? value.min)
      : (value.maxExclusive ?? value.min)),
    0,
  );
  if (min === 0) {
    return { relation: "lt", min, maxExclusive, display: `<${grouped(maxExclusive)}` };
  }
  return {
    relation: "range",
    min,
    maxExclusive,
    display: `${grouped(min)}–${grouped(maxExclusive - 1)}`,
  };
}

function competitionLabel(value: "low" | "medium" | "high" | null): string | null {
  if (value === "low") return "낮음";
  if (value === "medium") return "중간";
  if (value === "high") return "높음";
  return null;
}

export class NaverKeywordDbStore implements NaverKeywordServiceStore {
  async readSearchAds(
    requestKey: string,
    now: Date,
  ): Promise<CachedNaverSection<NaverKeywordStat[]> | null> {
    const cutoff = new Date(now.getTime() - NAVER_STALE_MAX_AGE_MS);
    const [latest] = await db.select().from(naverKeywordSnapshots).where(and(
      eq(naverKeywordSnapshots.requestedKeyword, requestKey),
      gte(naverKeywordSnapshots.capturedAt, cutoff),
    )).orderBy(desc(naverKeywordSnapshots.capturedAt)).limit(1);
    if (!latest) return null;

    const rows = await db.select().from(naverKeywordSnapshots).where(and(
      eq(naverKeywordSnapshots.requestedKeyword, requestKey),
      eq(naverKeywordSnapshots.source, latest.source),
      eq(naverKeywordSnapshots.capturedAt, latest.capturedAt),
    ));
    return {
      data: rows.map((row) => {
        const pc = storedCount({
          qualifier: row.pcSearchCountQualifier,
          min: row.pcSearchCountMin,
          maxExclusive: row.pcSearchCountMaxExclusive,
          display: row.pcSearchCountDisplay,
        });
        const mobile = storedCount({
          qualifier: row.mobileSearchCountQualifier,
          min: row.mobileSearchCountMin,
          maxExclusive: row.mobileSearchCountMaxExclusive,
          display: row.mobileSearchCountDisplay,
        });
        return {
          snapshotId: row.id,
          keyword: row.keyword,
          normalizedKeyword: row.normalizedKeyword,
          monthlyPcQueries: pc,
          monthlyMobileQueries: mobile,
          monthlyTotalQueries: sumCounts([pc, mobile]),
          monthlyAveragePcClicks: row.avgPcClicks,
          monthlyAverageMobileClicks: row.avgMobileClicks,
          monthlyAveragePcCtr: row.avgPcCtr,
          monthlyAverageMobileCtr: row.avgMobileCtr,
          averageAdDepth: row.adDepth,
          competition: row.competition,
          competitionLabel: competitionLabel(row.competition),
        } satisfies NaverKeywordStat;
      }),
      source: latest.source,
      fetchedAt: latest.capturedAt,
      expiresAt: latest.expiresAt,
      cache: latest.expiresAt > now ? "fresh" : "stale",
    };
  }

  async saveSearchAds(input: {
    requestKey: string;
    section: CachedNaverSection<NaverKeywordStat[]>;
  }): Promise<NaverKeywordStat[]> {
    const snapshotIds = new Map<number, string>();
    const rows = input.section.data.flatMap((row, index) => {
      const pc = row.monthlyPcQueries;
      const mobile = row.monthlyMobileQueries;
      if (!pc || !mobile || pc.relation === "range" || mobile.relation === "range") return [];
      const id = newId("nks");
      snapshotIds.set(index, id);
      return [{
        id,
        requestedKeyword: input.requestKey,
        keyword: row.keyword,
        normalizedKeyword: row.normalizedKeyword,
        pcSearchCountMin: pc.min,
        pcSearchCountMaxExclusive: pc.relation === "exact" ? null : pc.maxExclusive,
        pcSearchCountQualifier: pc.relation,
        pcSearchCountDisplay: pc.display,
        mobileSearchCountMin: mobile.min,
        mobileSearchCountMaxExclusive: mobile.relation === "exact" ? null : mobile.maxExclusive,
        mobileSearchCountQualifier: mobile.relation,
        mobileSearchCountDisplay: mobile.display,
        avgPcClicks: row.monthlyAveragePcClicks,
        avgMobileClicks: row.monthlyAverageMobileClicks,
        avgPcCtr: row.monthlyAveragePcCtr,
        avgMobileCtr: row.monthlyAverageMobileCtr,
        adDepth: row.averageAdDepth,
        competition: row.competition,
        source: input.section.source,
        capturedAt: input.section.fetchedAt,
        expiresAt: input.section.expiresAt,
      }];
    });
    if (rows.length === 0) return input.section.data.map((row) => ({ ...row, snapshotId: null }));
    for (let offset = 0; offset < rows.length; offset += 250) {
      await db.insert(naverKeywordSnapshots).values(rows.slice(offset, offset + 250));
    }
    return input.section.data.map((row, index) => ({
      ...row,
      snapshotId: snapshotIds.get(index) ?? null,
    }));
  }

  async readInsight<T>(input: {
    keyword: string;
    kind: NaverInsightKind;
    now: Date;
  }): Promise<CachedNaverSection<T> | null> {
    const cutoff = new Date(input.now.getTime() - NAVER_STALE_MAX_AGE_MS);
    const [row] = await db.select().from(naverKeywordInsights).where(and(
      eq(naverKeywordInsights.normalizedKeyword, normalizedKey(input.keyword)),
      eq(naverKeywordInsights.kind, input.kind),
      gte(naverKeywordInsights.capturedAt, cutoff),
    )).orderBy(desc(naverKeywordInsights.capturedAt)).limit(1);
    if (!row) return null;
    try {
      return {
        data: JSON.parse(row.payload) as T,
        source: row.source,
        fetchedAt: row.capturedAt,
        expiresAt: row.expiresAt,
        cache: row.expiresAt > input.now ? "fresh" : "stale",
      };
    } catch {
      return null;
    }
  }

  async saveInsight<T>(input: {
    keyword: string;
    kind: NaverInsightKind;
    section: CachedNaverSection<T>;
  }): Promise<void> {
    await db.insert(naverKeywordInsights).values({
      id: newId("nki"),
      keyword: input.keyword,
      normalizedKeyword: normalizedKey(input.keyword),
      kind: input.kind,
      schemaVersion: 1,
      payload: JSON.stringify(input.section.data),
      source: input.section.source,
      capturedAt: input.section.fetchedAt,
      expiresAt: input.section.expiresAt,
    });
  }
}

function budgetDateKst(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function reserveProviderBudget(
  provider: NaverBudgetProvider,
  now: Date,
  limit: number,
): Promise<boolean> {
  const budgetDate = budgetDateKst(now);
  await db.insert(providerCallBudgets).values({
    id: newId("npb"),
    provider,
    budgetDate,
    callCount: 0,
    callLimit: limit,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [providerCallBudgets.provider, providerCallBudgets.budgetDate],
    set: { callLimit: limit, updatedAt: now },
  });
  const [reserved] = await db.update(providerCallBudgets).set({
    callCount: sql`${providerCallBudgets.callCount} + 1`,
    updatedAt: now,
  }).where(and(
    eq(providerCallBudgets.provider, provider),
    eq(providerCallBudgets.budgetDate, budgetDate),
    lt(providerCallBudgets.callCount, limit),
  )).returning({ callCount: providerCallBudgets.callCount });
  return Boolean(reserved);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class DbProviderBudgetRepository implements ProviderBudgetRepository {
  async reserve(provider: NaverBudgetProvider, now: Date): Promise<boolean> {
    const limit = provider === "naver-search-ads"
      ? positiveInteger(process.env.NAVER_SEARCH_AD_DAILY_BUDGET, 1_000)
      : positiveInteger(process.env.NAVER_API_HUB_DAILY_BUDGET, 10_000);
    return reserveProviderBudget(provider, now, limit);
  }
}

export class DbPublicKeywordUsageRepository implements PublicKeywordUsageRepository {
  async cleanup(expiredBefore: Date): Promise<void> {
    await db.delete(publicKeywordUsage).where(lt(publicKeywordUsage.expiresAt, expiredBefore));
  }

  async list(identityHash: string, since: Date): Promise<PublicKeywordUsageRow[]> {
    return db.select({
      identityType: publicKeywordUsage.identityType,
      identityHash: publicKeywordUsage.identityHash,
      keywordHash: publicKeywordUsage.keywordHash,
      firstSeenAt: publicKeywordUsage.firstSeenAt,
      expiresAt: publicKeywordUsage.expiresAt,
    }).from(publicKeywordUsage).where(and(
      eq(publicKeywordUsage.identityHash, identityHash),
      gte(publicKeywordUsage.firstSeenAt, since),
    ));
  }

  async record(row: PublicKeywordUsageRow): Promise<void> {
    await db.insert(publicKeywordUsage).values({
      id: newId("pku"),
      ...row,
    }).onConflictDoUpdate({
      target: [
        publicKeywordUsage.identityType,
        publicKeywordUsage.identityHash,
        publicKeywordUsage.keywordHash,
      ],
      set: { firstSeenAt: row.firstSeenAt, expiresAt: row.expiresAt },
    });
  }

  async consumeAtomically(input: PublicKeywordAtomicInput): Promise<PublicKeywordAtomicResult> {
    return db.transaction((tx) => {
      tx.delete(publicKeywordUsage).where(lt(publicKeywordUsage.expiresAt, input.now)).run();
      const states = input.identities.map((identity) => {
        const rows = tx.select({
          keywordHash: publicKeywordUsage.keywordHash,
          firstSeenAt: publicKeywordUsage.firstSeenAt,
        }).from(publicKeywordUsage).where(and(
          eq(publicKeywordUsage.identityType, identity.type),
          eq(publicKeywordUsage.identityHash, identity.hash),
          gte(publicKeywordUsage.firstSeenAt, input.since),
        )).all();
        const duplicate = rows.some((row) => row.keywordHash === input.keywordHash);
        return { identity, rows, duplicate };
      });
      for (const state of states) {
        if (!state.duplicate && state.rows.length >= state.identity.limit) {
          const oldest = state.rows.reduce(
            (value, row) => row.firstSeenAt < value ? row.firstSeenAt : value,
            state.rows[0].firstSeenAt,
          );
          return {
            allowed: false as const,
            scope: state.identity.type,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((oldest.getTime() + input.windowMs - input.now.getTime()) / 1_000),
            ),
          };
        }
      }
      for (const state of states) {
        if (state.duplicate) continue;
        tx.insert(publicKeywordUsage).values({
          id: newId("pku"),
          identityType: state.identity.type,
          identityHash: state.identity.hash,
          keywordHash: input.keywordHash,
          firstSeenAt: input.now,
          expiresAt: input.expiresAt,
        }).onConflictDoUpdate({
          target: [
            publicKeywordUsage.identityType,
            publicKeywordUsage.identityHash,
            publicKeywordUsage.keywordHash,
          ],
          set: { firstSeenAt: input.now, expiresAt: input.expiresAt },
        }).run();
      }
      return {
        allowed: true as const,
        states: states.map((state) => ({
          type: state.identity.type,
          duplicate: state.duplicate,
          count: state.rows.length + (state.duplicate ? 0 : 1),
        })),
      };
    });
  }
}
