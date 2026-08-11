// @TASK P3-C1-T1 - Google rank/AIO collection job handler
// @SPEC docs/planning/06-tasks.md#p3-c1-t1--google-rank와-aio-수집
// @TEST src/server/collectors/google/collector.test.ts
import { createHash } from "node:crypto";
import { domainToASCII } from "node:url";

import { z } from "zod";

import {
  defineJobHandler,
  jobDead,
  jobRetryable,
  jobSucceeded,
  type JobHandler,
} from "@/server/jobs/contracts";
import {
  TalordataProviderFailure,
  type TalordataGoogleProvider,
  type TalordataGoogleSearchResult,
} from "@/server/providers/talordata/provider";
import { normalizeSiteDomain } from "@/server/sites/domain";

export type AioPresence = "present" | "absent" | "unknown";

export interface GoogleRankObservation {
  readonly trackedQueryId: string;
  readonly position: number | null;
  /** position=null이 정확히 >100을 뜻함을 port 경계에서 보존한다. */
  readonly outsideTop100: boolean;
  readonly resultUrl: string | null;
  readonly resultTitle: string | null;
}

export interface GoogleAioCitation {
  readonly url: string;
  readonly title: string | null;
  readonly position: number;
}

export interface GoogleAioObservation {
  readonly trackedQueryId: string;
  readonly presence: AioPresence;
  readonly answerText: string | null;
  readonly citations: readonly GoogleAioCitation[];
}

export interface GoogleObservationBatch {
  readonly workspaceId: string;
  readonly siteId: string;
  readonly providerCallId: string;
  readonly observedAt: string;
  readonly collectedAt: string;
  readonly provenance: TalordataGoogleSearchResult["provenance"];
  readonly rankObservations: readonly GoogleRankObservation[];
  readonly aioObservations: readonly GoogleAioObservation[];
}

export interface GoogleObservationRepository {
  upsert(batch: GoogleObservationBatch): Promise<void>;
}

const TrackedQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  siteId: z.string().uuid(),
  trackedQueryId: z.string().uuid(),
  type: z.enum(["rank", "aio"]),
  query: z.string().min(1).max(200),
});

const GoogleCollectionPayloadSchema = z.object({
  siteId: z.string().uuid(),
  siteDomain: z.string().min(1).max(253),
  observedAt: z.string().datetime({ offset: true }),
  periodStart: z.string().datetime({ offset: true }),
  periodEnd: z.string().datetime({ offset: true }),
  reservationExpiresAt: z.string().datetime({ offset: true }),
  maxProviderCalls: z.number().int().positive().max(40),
  maxBillableUnits: z.number().int().positive().max(80),
  queries: z.array(TrackedQuerySchema).min(1).max(40),
});

const TalordataReplayResultSchema = z.object({
  query: z.string(),
  organic: z.array(
    z.object({
      position: z.number().int().positive(),
      title: z.string(),
      link: z.string().url(),
      domain: z.string(),
      displayLink: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
  organicCoverage: z.object({
    requested: z.literal(100),
    validatedThrough: z.number().int().nonnegative(),
    complete: z.boolean(),
  }),
  aiOverview: z.object({
    present: z.boolean(),
    presenceAvailable: z.boolean(),
    citationsAvailable: z.boolean(),
    citations: z.array(
      z.object({
        url: z.string().url(),
        domain: z.string(),
        title: z.string().nullable(),
      }),
    ),
  }),
  providerRequestId: z.string().nullable(),
  collectedAt: z.string().datetime({ offset: true }),
  provenance: z.object({
    source: z.literal("talordata"),
    engine: z.literal("google"),
    country: z.literal("kr"),
    language: z.literal("ko"),
    device: z.literal("desktop"),
    window: z.literal(100),
  }),
});

const TalordataReplayMetadataSchema = z.object({
  schema: z.literal("semforge.talordata.google.v1"),
  result: TalordataReplayResultSchema,
});

export type GoogleCollectionPayload = z.infer<typeof GoogleCollectionPayloadSchema> &
  Record<string, unknown>;

interface QueryGroup {
  readonly normalizedQuery: string;
  readonly queries: readonly z.infer<typeof TrackedQuerySchema>[];
  readonly includeAiOverview: boolean;
  readonly billableUnits: 1 | 2;
}

interface GoogleCollectorDependencies {
  readonly provider: TalordataGoogleProvider;
  readonly observations: GoogleObservationRepository;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeGoogleQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
}

function normalizeDomain(value: string): string | null {
  const trimmed = value.trim().replace(/\.$/u, "").toLocaleLowerCase("en-US");
  const ascii = domainToASCII(trimmed);
  if (!ascii || ascii.length > 253 || !ascii.includes(".")) return null;
  return ascii;
}

function normalizeRegisteredSiteDomain(value: string): string | null {
  try {
    return normalizeSiteDomain(value);
  } catch {
    return null;
  }
}

function domainFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return normalizeDomain(url.hostname);
  } catch {
    return null;
  }
}

function belongsToSite(candidate: string, siteDomain: string): boolean {
  return candidate === siteDomain || candidate.endsWith(`.${siteDomain}`);
}

function groupQueries(
  queries: readonly z.infer<typeof TrackedQuerySchema>[],
): readonly QueryGroup[] {
  const groups = new Map<string, z.infer<typeof TrackedQuerySchema>[]>();
  for (const query of queries) {
    const normalizedQuery = normalizeGoogleQuery(query.query);
    const current = groups.get(normalizedQuery) ?? [];
    current.push(query);
    groups.set(normalizedQuery, current);
  }
  return [...groups.entries()].map(([normalizedQuery, groupedQueries]) => {
    const includeAiOverview = groupedQueries.some((query) => query.type === "aio");
    return {
      normalizedQuery,
      queries: groupedQueries,
      includeAiOverview,
      // TalorData 공식 계약상 AIO page_token 해소는 최대 2 response로 과금된다.
      billableUnits: includeAiOverview ? 2 : 1,
    };
  });
}

function rankObservation(
  trackedQueryId: string,
  siteDomain: string,
  result: TalordataGoogleSearchResult,
): GoogleRankObservation {
  const match = result.organic
    .filter((item) => Number.isInteger(item.position) && item.position >= 1 && item.position <= 100)
    .map((item) => ({ item, domain: domainFromUrl(item.link) }))
    .filter(
      (candidate): candidate is { item: (typeof result.organic)[number]; domain: string } =>
        candidate.domain !== null && belongsToSite(candidate.domain, siteDomain),
    )
    .sort((left, right) => left.item.position - right.item.position)[0]?.item;

  return match
    ? {
        trackedQueryId,
        position: match.position,
        outsideTop100: false,
        resultUrl: match.link,
        resultTitle: match.title || null,
      }
    : {
        trackedQueryId,
        position: null,
        outsideTop100: true,
        resultUrl: null,
        resultTitle: null,
      };
}

function verifiedCitations(result: TalordataGoogleSearchResult): readonly GoogleAioCitation[] {
  const seen = new Set<string>();
  const citations: GoogleAioCitation[] = [];
  for (const citation of result.aiOverview.citations) {
    const domain = domainFromUrl(citation.url);
    if (!domain || seen.has(citation.url)) continue;
    seen.add(citation.url);
    citations.push({
      url: citation.url,
      title: citation.title,
      position: citations.length + 1,
    });
  }
  return citations;
}

function aioObservation(
  trackedQueryId: string,
  siteDomain: string,
  result: TalordataGoogleSearchResult,
): GoogleAioObservation {
  const citations = verifiedCitations(result);
  let presence: AioPresence;
  if (!result.aiOverview.presenceAvailable) {
    presence = "unknown";
  } else if (!result.aiOverview.present) {
    presence = "absent";
  } else if (!result.aiOverview.citationsAvailable) {
    presence = "unknown";
  } else {
    presence = citations.some((citation) => {
      const domain = domainFromUrl(citation.url);
      return domain !== null && belongsToSite(domain, siteDomain);
    })
      ? "present"
      : "absent";
  }
  return {
    trackedQueryId,
    presence,
    answerText: null,
    citations,
  };
}

function responseMetadata(result: TalordataGoogleSearchResult): Readonly<Record<string, unknown>> {
  return {
    schema: "semforge.talordata.google.v1",
    providerRequestId: result.providerRequestId,
    collectedAt: result.collectedAt,
    provenance: result.provenance,
    result,
  };
}

function providerFailureDisposition(
  failure: TalordataProviderFailure,
): "retryable" | "terminal" | "outcome_unknown" {
  if (failure.disposition === "terminal") return "terminal";
  return ["timeout", "network", "aborted"].includes(failure.reason)
    ? "outcome_unknown"
    : "retryable";
}

function makeBatch(input: {
  workspaceId: string;
  siteId: string;
  siteDomain: string;
  providerCallId: string;
  observedAt: string;
  group: QueryGroup;
  result: TalordataGoogleSearchResult;
}): GoogleObservationBatch {
  return {
    workspaceId: input.workspaceId,
    siteId: input.siteId,
    providerCallId: input.providerCallId,
    observedAt: input.observedAt,
    collectedAt: input.result.collectedAt,
    provenance: input.result.provenance,
    rankObservations: input.group.queries
      .filter((query) => query.type === "rank")
      .map((query) => rankObservation(query.trackedQueryId, input.siteDomain, input.result)),
    aioObservations: input.group.queries
      .filter((query) => query.type === "aio")
      .map((query) => aioObservation(query.trackedQueryId, input.siteDomain, input.result)),
  };
}

function invalidPayload(message: string): ReturnType<typeof jobDead> {
  return jobDead(`GOOGLE_COLLECTION_INVALID: ${message}`);
}

export function createGoogleCollectionJobHandler(
  dependencies: GoogleCollectorDependencies,
): JobHandler<GoogleCollectionPayload> {
  return defineJobHandler<GoogleCollectionPayload>(async (job, context) => {
    const parsed = GoogleCollectionPayloadSchema.safeParse(job.payload);
    if (!parsed.success) return invalidPayload(parsed.error.issues[0]?.message ?? "payload");
    const payload = parsed.data;
    if (job.workspaceId !== context.workspaceId) {
      return invalidPayload("job/context workspace mismatch");
    }
    if (
      payload.queries.some(
        (query) => query.workspaceId !== job.workspaceId || query.siteId !== payload.siteId,
      )
    ) {
      return invalidPayload("workspace/site/query boundary mismatch");
    }
    const trackedQueryIds = new Set<string>();
    const typedQueries = new Set<string>();
    for (const query of payload.queries) {
      const normalizedQuery = normalizeGoogleQuery(query.query);
      const typedQuery = `${query.type}\u0000${normalizedQuery}`;
      if (
        !normalizedQuery ||
        normalizedQuery.length > 200 ||
        trackedQueryIds.has(query.trackedQueryId) ||
        typedQueries.has(typedQuery)
      ) {
        return invalidPayload("query identity/normalization");
      }
      trackedQueryIds.add(query.trackedQueryId);
      typedQueries.add(typedQuery);
    }
    const siteDomain = normalizeRegisteredSiteDomain(payload.siteDomain);
    if (!siteDomain) return invalidPayload("site domain");
    const periodStart = new Date(payload.periodStart);
    const periodEnd = new Date(payload.periodEnd);
    const reservationExpiresAt = new Date(payload.reservationExpiresAt);
    if (!(periodStart < periodEnd) || !(context.now() < reservationExpiresAt)) {
      return invalidPayload("reservation period");
    }
    const groups = groupQueries(payload.queries);
    const billableUnits = groups.reduce((total, group) => total + group.billableUnits, 0);
    if (groups.length > payload.maxProviderCalls || billableUnits > payload.maxBillableUnits) {
      return jobDead("GOOGLE_COLLECTION_BUDGET_EXCEEDED");
    }

    let rankCount = 0;
    let aioCount = 0;
    await context.audit("google_collection.started", {
      siteId: payload.siteId,
      providerCalls: groups.length,
      billableUnits,
    });

    for (const group of groups) {
      if (context.signal.aborted) return jobRetryable("GOOGLE_COLLECTION_ABORTED");
      const requestHash = sha256(
        JSON.stringify({
          query: group.normalizedQuery,
          engine: "google",
          country: "kr",
          language: "ko",
          device: "desktop",
          window: 100,
          aiOverview: group.includeAiOverview,
        }),
      );
      const callKey = `${job.idempotencyKey}:google:${sha256(group.normalizedQuery).slice(0, 24)}`;
      const reservation = await context.providerCalls.reserve({
        provider: "talordata",
        operation: group.includeAiOverview ? "google_serp_aio" : "google_serp_rank",
        idempotencyKey: callKey,
        requestHash,
        resource: "google_serp_response",
        units: group.billableUnits,
        periodStart,
        periodEnd,
        reservationExpiresAt,
      });
      if (reservation.disposition === "in_doubt") {
        return jobRetryable("GOOGLE_COLLECTION_PROVIDER_CALL_IN_DOUBT");
      }

      let result: TalordataGoogleSearchResult;
      if (reservation.disposition === "replay") {
        const replay = TalordataReplayMetadataSchema.safeParse(reservation.responseMetadata);
        if (!replay.success) {
          return jobRetryable("GOOGLE_COLLECTION_REPLAY_METADATA_INVALID");
        }
        result = replay.data.result;
      } else {
        try {
          result = await dependencies.provider.search({
            query: group.normalizedQuery,
            includeAiOverview: group.includeAiOverview,
            signal: context.signal,
          });
        } catch (error) {
          const failure =
            error instanceof TalordataProviderFailure
              ? error
              : new TalordataProviderFailure(
                  "terminal",
                  "unexpected",
                  error instanceof Error ? error.message : "unknown provider error",
                );
          await context.providerCalls.fail({
            providerCallId: reservation.providerCallId,
            usageReservationId: reservation.usageReservationId,
            errorCode: failure.reason,
            disposition: providerFailureDisposition(failure),
            responseMetadata: { disposition: failure.disposition },
          });
          return failure.disposition === "retryable"
            ? jobRetryable(`TALORDATA_${failure.reason.toUpperCase()}`)
            : jobDead(`TALORDATA_${failure.reason.toUpperCase()}`);
        }

        if (
          group.queries.some((query) => query.type === "rank") &&
          (!result.organicCoverage.complete || result.organicCoverage.validatedThrough < 100)
        ) {
          await context.providerCalls.fail({
            providerCallId: reservation.providerCallId,
            usageReservationId: reservation.usageReservationId,
            errorCode: "partial_organic_coverage",
            disposition: "retryable",
            responseMetadata: { organicCoverage: result.organicCoverage },
          });
          return jobRetryable("TALORDATA_PARTIAL_ORGANIC_COVERAGE");
        }

        await context.providerCalls.succeed({
          providerCallId: reservation.providerCallId,
          usageReservationId: reservation.usageReservationId,
          responseMetadata: responseMetadata(result),
          costUnits: group.billableUnits,
        });
      }
      const batch = makeBatch({
        workspaceId: job.workspaceId,
        siteId: payload.siteId,
        siteDomain,
        providerCallId: reservation.providerCallId,
        observedAt: payload.observedAt,
        group,
        result,
      });
      try {
        await dependencies.observations.upsert(batch);
      } catch {
        return jobRetryable("GOOGLE_COLLECTION_OBSERVATION_UPSERT_FAILED");
      }
      rankCount += batch.rankObservations.length;
      aioCount += batch.aioObservations.length;
    }

    await context.audit("google_collection.succeeded", {
      siteId: payload.siteId,
      providerCalls: groups.length,
      billableUnits,
      rankObservations: rankCount,
      aioObservations: aioCount,
    });
    return jobSucceeded({
      provider: "talordata",
      providerCalls: groups.length,
      billableUnits,
      rankObservations: rankCount,
      aioObservations: aioCount,
    });
  });
}
