import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiVisibilityCitations,
  aiVisibilityObservations,
  aiVisibilityPrompts,
  aiVisibilityRuns,
  keywordMetrics,
  type AiVisibilityProvider,
  type AiVisibilityStatus,
} from "@/db/schema";
import { getTrackingLocation } from "@/lib/position-tracking/locations";
import type { AuthContext } from "@/lib/session";
import { getAiSearchCapabilities } from "@/server/ai-search/providers";
import {
  getAiVisibilityProjectBundle,
  listAiVisibilityFolders,
  normalizeAiPrompt,
} from "./projects";

export const AI_VISIBILITY_RETENTION_DAYS = 400;
export type AiVisibilityRange = "1m" | "6m" | "all";
export type AiVisibilityTab =
  | "top_topics"
  | "topic_opportunities"
  | "cited_sources"
  | "source_opportunities"
  | "cited_pages";

const PROVIDER_LABELS: Record<AiVisibilityProvider, string> = {
  google_aio: "Google AI 개요",
  chatgpt_web: "ChatGPT 웹 검색",
  gemini_grounded: "Gemini 검색 그라운딩",
};

export interface DashboardCitation {
  id: string;
  observationId: string;
  position: number;
  url: string;
  domain: string;
  title: string | null;
  isOwnDomain: boolean;
}

export interface DashboardObservation {
  id: string;
  runId: string | null;
  promptId: string;
  prompt: string;
  topic: string;
  provider: AiVisibilityProvider;
  countryCode: string;
  locationKey: string;
  visibilityStatus: AiVisibilityStatus;
  brandMentioned: boolean | null;
  citationsAvailable: boolean;
  responseText: string | null;
  source: string;
  fromCache: boolean;
  capturedAt: Date;
}

export interface AiVisibilityMetric {
  visibility: number | null;
  mentions: number;
  citations: number;
  citedPages: number;
  measured: number;
  observed: number;
  unknown: number;
}

export interface AiVisibilityDashboardResponse {
  scope: {
    fid: string;
    projectId: string;
    projectName: string;
    domain: string;
    brandName: string;
    brandAliases: string[];
    countries: string[];
    providers: AiVisibilityProvider[];
    range: AiVisibilityRange;
    configuredProviders: AiVisibilityProvider[];
    configuredLocations: { key: string; label: string; countryCode: string }[];
    prompts: number;
  };
  projects: Awaited<ReturnType<typeof listAiVisibilityFolders>>;
  capabilities: ReturnType<typeof getAiSearchCapabilities>;
  kpis: {
    visibility: { value: number | null; delta: number | null; measured: number };
    mentions: { value: number; delta: number | null };
    citations: { value: number; delta: number | null };
    citedPages: { value: number; delta: number | null };
  };
  trend: {
    date: string;
    visibility: number | null;
    mentions: number;
    citations: number;
    citedPages: number;
    measured: number;
  }[];
  providerBreakdown: BreakdownRow[];
  countryBreakdown: BreakdownRow[];
  actions: ActionRow[];
  tabs: Record<AiVisibilityTab, { count: number }>;
  table: { tab: AiVisibilityTab; rows: DashboardTableRow[] };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  latestRun: {
    id: string;
    status: string;
    processed: number;
    total: number;
    failed: number;
    createdAt: string;
    completedAt: string | null;
  } | null;
  provenance: {
    formula: string;
    retentionDays: number;
    sources: { provider: AiVisibilityProvider; label: string; source: string }[];
    lastCollectedAt: string | null;
  };
  completeness: {
    expectedCells: number;
    observedCells: number;
    measurableCells: number;
    unknownCells: number;
    failedItems: number;
    ratio: number;
    measurementRatio: number;
  };
}

export interface BreakdownRow extends AiVisibilityMetric {
  key: string;
  label: string;
  share: number;
}

export interface ActionRow {
  id: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  severity: "high" | "medium" | "info";
}

export interface DashboardTableRow {
  id: string;
  label: string;
  detail: string | null;
  visibility: number | null;
  mentions: number;
  citations: number;
  citedPages: number;
  count: number;
  googleDemand: number | null;
  providers: AiVisibilityProvider[];
  countries: string[];
  href: string | null;
}

function rangeDays(range: AiVisibilityRange): number {
  if (range === "1m") return 31;
  if (range === "6m") return 183;
  return AI_VISIBILITY_RETENTION_DAYS;
}

function cellKey(observation: DashboardObservation): string {
  return `${observation.promptId}:${observation.provider}:${observation.locationKey}`;
}

export function latestObservationPairs(observations: DashboardObservation[]) {
  const sorted = [...observations].sort(
    (a, b) => b.capturedAt.getTime() - a.capturedAt.getTime(),
  );
  const latest = new Map<string, DashboardObservation>();
  const previous = new Map<string, DashboardObservation>();
  for (const observation of sorted) {
    const key = cellKey(observation);
    if (!latest.has(key)) latest.set(key, observation);
    else if (!previous.has(key)) previous.set(key, observation);
  }
  return { latest: [...latest.values()], previous: [...previous.values()] };
}

function citationMap(citations: DashboardCitation[]) {
  const result = new Map<string, DashboardCitation[]>();
  for (const citation of citations) {
    const rows = result.get(citation.observationId) ?? [];
    rows.push(citation);
    result.set(citation.observationId, rows);
  }
  return result;
}

export function computeAiVisibilityMetric(
  observations: DashboardObservation[],
  citations: DashboardCitation[],
): AiVisibilityMetric {
  const byObservation = citationMap(citations);
  const measurable = observations.filter(
    (observation) => observation.visibilityStatus !== "unknown",
  );
  const visible = measurable.filter((observation) => {
    const ownCitation = (byObservation.get(observation.id) ?? []).some(
      (citation) => citation.isOwnDomain,
    );
    return observation.brandMentioned === true || ownCitation;
  });
  const ownCitations = observations.flatMap((observation) =>
    (byObservation.get(observation.id) ?? []).filter((citation) => citation.isOwnDomain),
  );
  return {
    visibility: measurable.length > 0
      ? Math.round((visible.length / measurable.length) * 1000) / 10
      : null,
    mentions: observations.filter((observation) => observation.brandMentioned === true).length,
    citations: ownCitations.length,
    citedPages: new Set(ownCitations.map((citation) => citation.url)).size,
    measured: measurable.length,
    observed: observations.length,
    unknown: observations.length - measurable.length,
  };
}

function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
}

export function metricBreakdown(
  observations: DashboardObservation[],
  citations: DashboardCitation[],
  getKey: (row: DashboardObservation) => string,
  getLabel: (key: string) => string,
): BreakdownRow[] {
  const groups = new Map<string, DashboardObservation[]>();
  for (const observation of observations) {
    const key = getKey(observation);
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  const totalVisible = observations.filter((row) => row.visibilityStatus === "visible").length;
  return [...groups.entries()].map(([key, rows]) => {
    const metric = computeAiVisibilityMetric(rows, citations);
    const visible = rows.filter((row) => row.visibilityStatus === "visible").length;
    return {
      key,
      label: getLabel(key),
      ...metric,
      share: totalVisible > 0 ? Math.round((visible / totalVisible) * 1000) / 10 : 0,
    };
  }).sort((a, b) => (b.visibility ?? -1) - (a.visibility ?? -1));
}

export function buildTopicRows(
  observations: DashboardObservation[],
  citations: DashboardCitation[],
  demandByPrompt: Map<string, number>,
): DashboardTableRow[] {
  const groups = new Map<string, DashboardObservation[]>();
  for (const observation of observations) {
    groups.set(observation.topic, [...(groups.get(observation.topic) ?? []), observation]);
  }
  return [...groups.entries()].map(([topic, rows]) => {
    const metric = computeAiVisibilityMetric(rows, citations);
    const promptIds = [...new Set(rows.map((row) => row.promptId))];
    const demands = promptIds.map((id) => demandByPrompt.get(id)).filter((value): value is number => value !== undefined);
    return {
      id: `topic:${topic}`,
      label: topic,
      detail: `${promptIds.length}개 프롬프트`,
      ...metric,
      count: promptIds.length,
      googleDemand: demands.length > 0 ? demands.reduce((sum, value) => sum + value, 0) : null,
      providers: [...new Set(rows.map((row) => row.provider))],
      countries: [...new Set(rows.map((row) => row.countryCode))],
      href: null,
    };
  });
}

export function selectTopicOpportunities(
  rows: DashboardTableRow[],
  projectVisibility: number | null,
): DashboardTableRow[] {
  if (projectVisibility === null) return [];
  return rows
    .filter((row) => row.visibility !== null && row.visibility < projectVisibility)
    .sort((a, b) => (a.visibility ?? 101) - (b.visibility ?? 101));
}

export function buildCitationRows(
  observations: DashboardObservation[],
  citations: DashboardCitation[],
  own: boolean,
  opportunityOnly: boolean,
): DashboardTableRow[] {
  const observationById = new Map(observations.map((row) => [row.id, row]));
  const filtered = citations.filter((citation) => {
    if (citation.isOwnDomain !== own) return false;
    const observation = observationById.get(citation.observationId);
    if (!observation) return false;
    return !opportunityOnly || observation.visibilityStatus === "not_visible";
  });
  const groups = new Map<string, DashboardCitation[]>();
  for (const citation of filtered) {
    const key = own ? citation.url : citation.domain;
    groups.set(key, [...(groups.get(key) ?? []), citation]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const relatedById = new Map(rows
      .map((row) => observationById.get(row.observationId))
      .filter((row): row is DashboardObservation => Boolean(row))
      .map((row) => [row.id, row]));
    const related = [...relatedById.values()];
    return {
      id: `${own ? "page" : "source"}:${key}`,
      label: key,
      detail: rows.find((row) => row.title)?.title ?? null,
      visibility: computeAiVisibilityMetric(related, citations).visibility,
      mentions: related.filter((row) => row.brandMentioned === true).length,
      citations: rows.length,
      citedPages: new Set(rows.map((row) => row.url)).size,
      count: new Set(rows.map((row) => row.observationId)).size,
      googleDemand: null,
      providers: [...new Set(related.map((row) => row.provider))],
      countries: [...new Set(related.map((row) => row.countryCode))],
      href: own ? key : `https://${key}`,
    };
  }).sort((a, b) => b.citations - a.citations);
}

function buildActions(input: {
  fid: string;
  overall: AiVisibilityMetric;
  providers: BreakdownRow[];
  topicOpportunities: DashboardTableRow[];
  sourceOpportunities: DashboardTableRow[];
  unknownRatio: number;
}): ActionRow[] {
  const actions: ActionRow[] = [];
  const lowProvider = input.providers
    .filter((row) => row.measured > 0)
    .sort((a, b) => (a.visibility ?? 101) - (b.visibility ?? 101))[0];
  if (lowProvider && (lowProvider.visibility ?? 100) < 50) {
    actions.push({
      id: "provider-gap",
      title: `${lowProvider.label} 노출 보강`,
      description: `현재 가시성 ${lowProvider.visibility ?? 0}%로 가장 낮습니다. 해당 플랫폼의 실측 프롬프트를 우선 검토하세요.`,
      href: `/ai-seo/overview/?fid=${encodeURIComponent(input.fid)}&providers=${lowProvider.key}`,
      cta: "플랫폼 결과 보기",
      severity: "high",
    });
  }
  const topic = input.topicOpportunities[0];
  if (topic) {
    actions.push({
      id: "topic-gap",
      title: `주제 기회: ${topic.label}`,
      description: `${topic.count}개 프롬프트의 가시성이 프로젝트 평균보다 낮습니다. 관련 페이지와 답변 근거를 보강하세요.`,
      href: `/position-tracking/?folder=${encodeURIComponent(input.fid)}`,
      cta: "포지션 추적 열기",
      severity: "medium",
    });
  }
  const source = input.sourceOpportunities[0];
  if (source) {
    actions.push({
      id: "source-gap",
      title: `반복 인용 소스 분석: ${source.label}`,
      description: `자사 미노출 응답에서 ${source.citations}회 인용됐습니다. 해당 출처가 제공하는 근거 구조를 비교하세요.`,
      href: `/site-audit/?fid=${encodeURIComponent(input.fid)}`,
      cta: "사이트 진단 열기",
      severity: "medium",
    });
  }
  if (input.unknownRatio > 0) {
    actions.push({
      id: "unknown-cells",
      title: "측정 불가 응답 확인",
      description: `최신 관측의 ${input.unknownRatio}%는 인용 정보가 없어 점수에서 제외되었습니다. 원문과 수집 출처를 확인하세요.`,
      href: `/ai-seo/overview/?fid=${encodeURIComponent(input.fid)}&show=unknown`,
      cta: "측정 불가 보기",
      severity: "info",
    });
  }
  if (actions.length === 0) {
    actions.push({
      id: "maintain",
      title: "주간 관측 유지",
      description: "현재 필터에서 큰 격차가 확인되지 않았습니다. 정기 수집으로 변화를 계속 확인하세요.",
      href: `/ai-seo/overview/?fid=${encodeURIComponent(input.fid)}`,
      cta: "전체 결과 보기",
      severity: "info",
    });
  }
  return actions.slice(0, 4);
}

export async function getProjectAiVisibilityDashboard(
  auth: AuthContext,
  folderId: string,
  options?: {
    countries?: string[];
    providers?: AiVisibilityProvider[];
    range?: AiVisibilityRange;
    tab?: AiVisibilityTab;
    q?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<AiVisibilityDashboardResponse> {
  const bundle = await getAiVisibilityProjectBundle(auth, folderId);
  const projects = await listAiVisibilityFolders(auth);
  const configuredCountries = [...new Set(bundle.scopes.map((scope) => scope.countryCode))];
  const filteredCountries = (options?.countries?.length ? options.countries : configuredCountries)
    .filter((country) => configuredCountries.includes(country));
  const countries = filteredCountries.length > 0 ? filteredCountries : configuredCountries;
  const filteredProviders = (options?.providers?.length ? options.providers : bundle.providers)
    .filter((provider) => bundle.providers.includes(provider));
  const providers = filteredProviders.length > 0 ? filteredProviders : bundle.providers;
  const range = options?.range ?? "1m";
  const tab = options?.tab ?? "top_topics";
  const cutoff = new Date(Date.now() - rangeDays(range) * 24 * 60 * 60 * 1000);
  const filters = [
    eq(aiVisibilityObservations.projectId, bundle.project.id),
    gte(aiVisibilityObservations.capturedAt, cutoff),
  ];
  if (countries.length > 0) filters.push(inArray(aiVisibilityObservations.countryCode, countries));
  if (providers.length > 0) filters.push(inArray(aiVisibilityObservations.provider, providers));
  const observations = await db
    .select({
      id: aiVisibilityObservations.id,
      runId: aiVisibilityObservations.runId,
      promptId: aiVisibilityObservations.promptId,
      prompt: aiVisibilityPrompts.prompt,
      topic: aiVisibilityPrompts.topic,
      provider: aiVisibilityObservations.provider,
      countryCode: aiVisibilityObservations.countryCode,
      locationKey: aiVisibilityObservations.locationKey,
      visibilityStatus: aiVisibilityObservations.visibilityStatus,
      brandMentioned: aiVisibilityObservations.brandMentioned,
      citationsAvailable: aiVisibilityObservations.citationsAvailable,
      responseText: aiVisibilityObservations.responseText,
      source: aiVisibilityObservations.source,
      fromCache: aiVisibilityObservations.fromCache,
      capturedAt: aiVisibilityObservations.capturedAt,
    })
    .from(aiVisibilityObservations)
    .innerJoin(aiVisibilityPrompts, eq(aiVisibilityPrompts.id, aiVisibilityObservations.promptId))
    .where(and(...filters))
    .orderBy(desc(aiVisibilityObservations.capturedAt));
  const observationIds = observations.map((row) => row.id);
  const citations: DashboardCitation[] = observationIds.length > 0
    ? await db
        .select()
        .from(aiVisibilityCitations)
        .where(inArray(aiVisibilityCitations.observationId, observationIds))
    : [];
  const { latest, previous } = latestObservationPairs(observations);
  const latestIds = new Set(latest.map((row) => row.id));
  const previousIds = new Set(previous.map((row) => row.id));
  const latestCitations = citations.filter((citation) => latestIds.has(citation.observationId));
  const previousCitations = citations.filter((citation) => previousIds.has(citation.observationId));
  const currentMetric = computeAiVisibilityMetric(latest, latestCitations);
  const previousMetric = computeAiVisibilityMetric(previous, previousCitations);

  const providerBreakdown = metricBreakdown(
    latest,
    latestCitations,
    (row) => row.provider,
    (key) => PROVIDER_LABELS[key as AiVisibilityProvider],
  );
  const countryBreakdown = metricBreakdown(
    latest,
    latestCitations,
    (row) => row.countryCode,
    (key) => getTrackingLocation(bundle.scopes.find((scope) => scope.countryCode === key)?.locationKey ?? "")?.country ?? key,
  );

  const normalizedPrompts = bundle.prompts.map((prompt) => prompt.normalizedPrompt);
  const metricRows = normalizedPrompts.length > 0 && countries.length > 0
    ? await db
        .select({
          normalizedKeyword: keywordMetrics.normalizedKeyword,
          countryCode: keywordMetrics.countryCode,
          volume: keywordMetrics.volume,
          periodStart: keywordMetrics.periodStart,
        })
        .from(keywordMetrics)
        .where(
          and(
            inArray(keywordMetrics.normalizedKeyword, normalizedPrompts),
            inArray(keywordMetrics.countryCode, countries),
            eq(keywordMetrics.device, "desktop"),
          ),
        )
        .orderBy(desc(keywordMetrics.periodStart))
    : [];
  const latestVolumeByKey = new Map<string, number>();
  for (const row of metricRows) {
    const key = `${row.normalizedKeyword}:${row.countryCode}`;
    if (!latestVolumeByKey.has(key)) latestVolumeByKey.set(key, row.volume);
  }
  const demandByPrompt = new Map<string, number>();
  for (const prompt of bundle.prompts) {
    const values = countries
      .map((country) => latestVolumeByKey.get(`${normalizeAiPrompt(prompt.prompt)}:${country}`))
      .filter((value): value is number => value !== undefined);
    if (values.length > 0) demandByPrompt.set(prompt.id, values.reduce((sum, value) => sum + value, 0));
  }
  const topicRows = buildTopicRows(latest, latestCitations, demandByPrompt)
    .sort((a, b) => (b.visibility ?? -1) - (a.visibility ?? -1));
  const topicOpportunities = selectTopicOpportunities(topicRows, currentMetric.visibility);
  const citedSources = buildCitationRows(latest, latestCitations, false, false);
  const sourceOpportunities = buildCitationRows(latest, latestCitations, false, true);
  const citedPages = buildCitationRows(latest, latestCitations, true, false);
  const allRows: Record<AiVisibilityTab, DashboardTableRow[]> = {
    top_topics: topicRows,
    topic_opportunities: topicOpportunities,
    cited_sources: citedSources,
    source_opportunities: sourceOpportunities,
    cited_pages: citedPages,
  };
  const query = options?.q?.trim().toLocaleLowerCase() ?? "";
  const searchedRows = query
    ? allRows[tab].filter((row) => `${row.label} ${row.detail ?? ""}`.toLocaleLowerCase().includes(query))
    : allRows[tab];
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 10));
  const totalPages = Math.max(1, Math.ceil(searchedRows.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, options?.page ?? 1));
  const pagedRows = searchedRows.slice((page - 1) * pageSize, page * pageSize);

  const trendGroups = new Map<string, DashboardObservation[]>();
  for (const observation of observations) {
    const key = observation.capturedAt.toISOString().slice(0, 10);
    trendGroups.set(key, [...(trendGroups.get(key) ?? []), observation]);
  }
  const trend = [...trendGroups.entries()].map(([date, rows]) => {
    const latestForDay = latestObservationPairs(rows).latest;
    const ids = new Set(latestForDay.map((row) => row.id));
    const metric = computeAiVisibilityMetric(
      latestForDay,
      citations.filter((citation) => ids.has(citation.observationId)),
    );
    return { date, ...metric };
  }).sort((a, b) => a.date.localeCompare(b.date)).map((row) => ({
    date: row.date,
    visibility: row.visibility,
    mentions: row.mentions,
    citations: row.citations,
    citedPages: row.citedPages,
    measured: row.measured,
  }));

  const [latestRun] = await db
    .select()
    .from(aiVisibilityRuns)
    .where(eq(aiVisibilityRuns.projectId, bundle.project.id))
    .orderBy(desc(aiVisibilityRuns.createdAt))
    .limit(1);
  const capabilities = getAiSearchCapabilities();
  const runnableProviders = providers.filter((provider) => capabilities.providers[provider].enabled);
  const expectedCells = bundle.prompts.length * runnableProviders.length * countries.length;
  const ratio = expectedCells > 0 ? Math.round((latest.length / expectedCells) * 1000) / 10 : 0;
  const measurementRatio = latest.length > 0
    ? Math.round((currentMetric.measured / latest.length) * 1000) / 10
    : 0;
  const unknownRatio = latest.length > 0
    ? Math.round((currentMetric.unknown / latest.length) * 1000) / 10
    : 0;
  const failedItems = latestRun?.failedCount ?? 0;

  return {
    scope: {
      fid: folderId,
      projectId: bundle.project.id,
      projectName: projects.find((project) => project.id === folderId)?.name ?? bundle.project.brandName,
      domain: bundle.project.domain,
      brandName: bundle.project.brandName,
      brandAliases: bundle.brandAliases,
      countries,
      providers,
      range,
      configuredProviders: bundle.providers,
      configuredLocations: bundle.scopes.map((scope) => {
        const location = getTrackingLocation(scope.locationKey);
        return { key: scope.locationKey, label: location?.label ?? scope.locationKey, countryCode: scope.countryCode };
      }),
      prompts: bundle.prompts.length,
    },
    projects,
    capabilities,
    kpis: {
      visibility: { value: currentMetric.visibility, delta: delta(currentMetric.visibility, previousMetric.visibility), measured: currentMetric.measured },
      mentions: { value: currentMetric.mentions, delta: delta(currentMetric.mentions, previousMetric.mentions) },
      citations: { value: currentMetric.citations, delta: delta(currentMetric.citations, previousMetric.citations) },
      citedPages: { value: currentMetric.citedPages, delta: delta(currentMetric.citedPages, previousMetric.citedPages) },
    },
    trend,
    providerBreakdown,
    countryBreakdown,
    actions: buildActions({ fid: folderId, overall: currentMetric, providers: providerBreakdown, topicOpportunities, sourceOpportunities, unknownRatio }),
    tabs: {
      top_topics: { count: topicRows.length },
      topic_opportunities: { count: topicOpportunities.length },
      cited_sources: { count: citedSources.length },
      source_opportunities: { count: sourceOpportunities.length },
      cited_pages: { count: citedPages.length },
    },
    table: { tab, rows: pagedRows },
    pagination: { page, pageSize, total: searchedRows.length, totalPages },
    latestRun: latestRun ? {
      id: latestRun.id,
      status: latestRun.status,
      processed: latestRun.processedCount,
      total: latestRun.totalCount,
      failed: latestRun.failedCount,
      createdAt: latestRun.createdAt.toISOString(),
      completedAt: latestRun.completedAt?.toISOString() ?? null,
    } : null,
    provenance: {
      formula: "측정 가능한 최신 프롬프트×플랫폼×국가 셀 중 브랜드 언급 또는 자사 도메인 인용 비율",
      retentionDays: AI_VISIBILITY_RETENTION_DAYS,
      sources: providers.map((provider) => ({
        provider,
        label: PROVIDER_LABELS[provider],
        source: provider === "google_aio" ? "TalorData SERP" : provider === "chatgpt_web" ? "OpenAI Responses 웹 검색" : "Gemini 검색 그라운딩",
      })),
      lastCollectedAt: observations[0]?.capturedAt.toISOString() ?? null,
    },
    completeness: {
      expectedCells,
      observedCells: latest.length,
      measurableCells: currentMetric.measured,
      unknownCells: currentMetric.unknown,
      failedItems,
      ratio,
      measurementRatio,
    },
  };
}

export async function getEmptyAiVisibilityShell(auth: AuthContext, folderId: string) {
  const projects = await listAiVisibilityFolders(auth);
  return {
    fid: folderId,
    projects,
    capabilities: getAiSearchCapabilities(),
  };
}
