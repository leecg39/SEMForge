import type { BacklinkReportCache } from "@/db/schema";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import { AhrefsDomainRatingProvider, AHREFS_ATTRIBUTION, AHREFS_LICENSE_URL } from "@/server/backlinks/ahrefs";
import { BingWebmasterProvider } from "@/server/backlinks/bing";
import { CommonCrawlBacklinkProvider } from "@/server/backlinks/common-crawl";
import { getBingConnection, selectBingSite, updateBingConnectionTokens } from "@/server/backlinks/connection";
import {
  BACKLINK_CSV_PROVIDER,
  BACKLINK_COMMON_CRAWL_PROVIDER,
  BACKLINK_PROVIDER,
  COMMON_CRAWL_CACHE_TTL_MS,
  type BacklinkImportMapping,
  type BacklinkImportPreview,
  type BacklinkListRequest,
  type BacklinkListResult,
  type BacklinkProvider,
  type BacklinkReport,
  type BacklinkReportRequest,
  type BacklinkRow,
  type BacklinkTargetPageRow,
} from "@/server/backlinks/contracts";
import { normalizeImportedBacklinks, parseBacklinkCsv, previewFromParsed } from "@/server/backlinks/csv";
import { filterBacklinkRows, listQueryKey, resolveBacklinkSort, sortBacklinkRows } from "@/server/backlinks/filters";
import { getBingOauthConfig, refreshBingAccessToken } from "@/server/backlinks/oauth";
import {
  acquireBacklinkRefreshLease,
  backlinkQueryHash,
  cleanupExpiredBacklinkCaches,
  deleteBacklinkImportStage,
  findBacklinkReportCache,
  findFreshBacklinkListCache,
  getBacklinkImportStage,
  listBacklinkSnapshots,
  listImportedBacklinks,
  replaceImportedBacklinks,
  saveBacklinkImportStage,
  saveBacklinkListCache,
  saveBacklinkReportFailure,
  saveBacklinkReportSuccess,
  saveBacklinkSnapshot,
} from "@/server/backlinks/store";
import { parseBacklinkTarget, targetBelongsToSite } from "@/server/backlinks/target";

interface ReportDetailsPayload {
  topTargetPages: BacklinkTargetPageRow[];
  partial: boolean;
  warning: string | null;
  domainRatingAttribution: typeof AHREFS_ATTRIBUTION | null;
  domainRatingLicenseUrl: string | null;
  commonCrawlRelease?: string | null;
  fallbackFromBing?: boolean;
}

const EMPTY_REPORT_DETAILS: ReportDetailsPayload = {
  topTargetPages: [],
  partial: false,
  warning: null,
  domainRatingAttribution: null,
  domainRatingLicenseUrl: null,
  commonCrawlRelease: null,
  fallbackFromBing: false,
};

function parseJson<T>(payload: string | null, fallback: T): T {
  if (!payload) return fallback;
  try { return JSON.parse(payload) as T; } catch { return fallback; }
}

function hasPayload(row: BacklinkReportCache): boolean {
  return Boolean(row.overviewPayload && row.historyPayload && row.scoreProfilePayload && row.fetchedAt);
}

function rowProvider(row: BacklinkReportCache): BacklinkProvider {
  if (row.provider !== BACKLINK_PROVIDER && row.provider !== BACKLINK_CSV_PROVIDER && row.provider !== BACKLINK_COMMON_CRAWL_PROVIDER) {
    throw new ApiError("NOT_FOUND", "현재 공급자로 수집된 백링크 결과가 없습니다.");
  }
  return row.provider;
}

function reportFromRow(row: BacklinkReportCache, options: { cached: boolean; warning?: string | null } = { cached: true }): BacklinkReport {
  if (!hasPayload(row) || !row.fetchedAt) throw new ApiError("NOT_FOUND", "저장된 백링크 분석 결과가 없습니다.", { details: { cacheMiss: true } });
  const provider = rowProvider(row);
  const details = parseJson<ReportDetailsPayload>(row.scoreProfilePayload, EMPTY_REPORT_DETAILS);
  const expiresAt = row.expiresAt ?? row.fetchedAt;
  const stale = row.status !== "ready" || expiresAt.getTime() <= Date.now();
  const siteUrl = row.effectiveTarget ?? (row.scope === "site" ? row.target : "");
  return {
    siteUrl,
    targetUrl: row.scope === "page" ? row.target : null,
    scope: row.scope === "page" ? "page" : "site",
    overview: parseJson(row.overviewPayload, { domainRating: null, totalInboundLinks: null, linkedPages: null, newLinks: null, lostLinks: null }),
    history: parseJson(row.historyPayload, []),
    topTargetPages: details.topTargetPages,
    provenance: {
      provider, fetchedAt: row.fetchedAt.toISOString(), expiresAt: expiresAt.toISOString(), stale,
      cached: options.cached, partial: details.partial,
      warning: options.warning ?? details.warning ?? (stale ? row.lastErrorMessage ?? "저장된 데이터가 24시간을 초과했습니다." : null),
      requestIds: parseJson<string[]>(row.requestIdsPayload, []),
      domainRatingAttribution: details.domainRatingAttribution,
      domainRatingLicenseUrl: details.domainRatingLicenseUrl,
      commonCrawlRelease: details.commonCrawlRelease ?? null,
      fallbackFromBing: Boolean(details.fallbackFromBing),
    },
  };
}

export async function activeBingProvider(workspaceId: string): Promise<{ provider: BingWebmasterProvider; selectedSiteUrl: string | null }> {
  const config = getBingOauthConfig();
  if (!config) throw new ApiError("INTERNAL", "Bing Webmaster 연결 설정이 완료되지 않았습니다.", { details: { providerReason: "configuration" } });
  let connection = await getBingConnection(workspaceId);
  if (!connection) throw new ApiError("UNAUTHENTICATED", "Bing Webmaster를 먼저 연결해 주세요.", { details: { providerReason: "not_connected" } });
  if (connection.expiryMs && connection.expiryMs <= Date.now() + 60_000) {
    if (!connection.refreshToken) throw new ApiError("UNAUTHENTICATED", "Bing 연결이 만료되었습니다. 다시 연결해 주세요.");
    const tokens = await refreshBingAccessToken(connection.refreshToken, config);
    await updateBingConnectionTokens({ id: connection.id, accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken, expiryMs: tokens.expiryMs });
    connection = { ...connection, accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? connection.refreshToken, expiryMs: tokens.expiryMs ?? null };
  }
  return { provider: new BingWebmasterProvider(connection.accessToken), selectedSiteUrl: connection.selectedSiteUrl };
}

export async function readCachedBacklinkReport(auth: AuthContext, input: {
  siteUrl: string; targetUrl?: string | null; scope: "site" | "page"; provider?: BacklinkProvider;
}): Promise<BacklinkReport> {
  const target = parseBacklinkTarget(input);
  const row = await findBacklinkReportCache(auth.workspaceId, target.cacheTarget, target.scope, input.provider);
  if (!row) throw new ApiError("NOT_FOUND", "저장된 백링크 분석 결과가 없습니다.", { details: { cacheMiss: true } });
  if (row.provider === BACKLINK_PROVIDER && !(await getBingConnection(auth.workspaceId))) {
    throw new ApiError("UNAUTHENTICATED", "Bing 연결이 해제되어 저장된 API 데이터에 접근할 수 없습니다.");
  }
  return reportFromRow(row);
}

type RefreshDependencies = {
  bing?: BingWebmasterProvider;
  ahrefs?: AhrefsDomainRatingProvider;
  commonCrawl?: CommonCrawlBacklinkProvider;
};

async function domainRating(
  siteUrl: string,
  provider = new AhrefsDomainRatingProvider(),
): Promise<{ value: number | null; licenseUrl: string | null; warning: string | null }> {
  return provider.get(new URL(siteUrl).hostname)
    .then((result) => ({ value: result.value, licenseUrl: result.licenseUrl, warning: null }))
    .catch((error: unknown) => ({
      value: null,
      licenseUrl: null,
      warning: error instanceof ApiError ? error.message : "Ahrefs Domain Rating을 불러오지 못했습니다.",
    }));
}

async function refreshBingBacklinkReport(
  auth: AuthContext,
  input: BacklinkReportRequest,
  dependencies: RefreshDependencies,
): Promise<BacklinkReport> {
  const parsed = parseBacklinkTarget(input);
  const lease = await acquireBacklinkRefreshLease({ workspaceId: auth.workspaceId, target: parsed.cacheTarget,
    scope: parsed.scope, provider: BACKLINK_PROVIDER, mode: input.mode });
  if (lease.kind === "fresh") return reportFromRow(lease.row, { cached: true });
  if (lease.kind === "busy") {
    if (hasPayload(lease.row)) return reportFromRow(lease.row, { cached: true, warning: "최신 데이터를 수집 중이어서 저장된 결과를 표시합니다." });
    throw new ApiError("DUPLICATE", "이 사이트의 백링크 데이터를 이미 수집 중입니다.", { details: { refreshing: true } });
  }
  try {
    const active = dependencies?.bing ? { provider: dependencies.bing, selectedSiteUrl: parsed.siteUrl } : await activeBingProvider(auth.workspaceId);
    const verifiedSites = await active.provider.listSites();
    if (!verifiedSites.some((site) => site.siteUrl === parsed.siteUrl && site.verified)) {
      throw new ApiError("FORBIDDEN", "선택한 URL은 이 Bing 계정의 인증 사이트가 아닙니다.");
    }
    await selectBingSite(auth.workspaceId, parsed.siteUrl);
    const [linkCounts, drResult] = await Promise.all([
      active.provider.getAllLinkCounts(parsed.siteUrl),
      domainRating(parsed.siteUrl, dependencies.ahrefs),
    ]);
    const scopedRows = parsed.scope === "page"
      ? linkCounts.rows.filter((row) => row.url === parsed.targetUrl)
      : linkCounts.rows;
    const totalInboundLinks = scopedRows.reduce((sum, row) => sum + row.linkCount, 0);
    const linkedPages = scopedRows.length;
    const capturedAt = new Date();
    await saveBacklinkSnapshot({ workspaceId: auth.workspaceId, siteUrl: parsed.siteUrl, scope: parsed.scope,
      targetUrl: parsed.targetUrl, provider: BACKLINK_PROVIDER, totalInboundLinks, linkedPages, capturedAt });
    const snapshots = await listBacklinkSnapshots({ workspaceId: auth.workspaceId, siteUrl: parsed.siteUrl,
      scope: parsed.scope, targetUrl: parsed.targetUrl, provider: BACKLINK_PROVIDER });
    const previous = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
    const delta = previous?.totalInboundLinks === null || previous?.totalInboundLinks === undefined ? null : totalInboundLinks - previous.totalInboundLinks;
    const emptyWarning = scopedRows.length === 0 ? "Bing이 링크를 반환하지 않아 Common Crawl 자동 보완 수집을 시도합니다." : null;
    const warning = [emptyWarning, drResult.warning].filter(Boolean).join(" ") || null;
    const overview = { domainRating: drResult.value, totalInboundLinks, linkedPages,
      newLinks: delta === null ? null : Math.max(0, delta), lostLinks: delta === null ? null : Math.max(0, -delta) };
    const details: ReportDetailsPayload = {
      topTargetPages: [...scopedRows].sort((a, b) => b.linkCount - a.linkCount),
      partial: linkCounts.partial || Boolean(drResult.warning), warning,
      domainRatingAttribution: drResult.value === null ? null : AHREFS_ATTRIBUTION,
      domainRatingLicenseUrl: drResult.value === null ? null : drResult.licenseUrl ?? AHREFS_LICENSE_URL,
      commonCrawlRelease: null,
      fallbackFromBing: false,
    };
    const saved = await saveBacklinkReportSuccess({ id: lease.row.id, effectiveTarget: parsed.siteUrl,
      overviewPayload: JSON.stringify(overview),
      historyPayload: JSON.stringify(snapshots.map((item) => ({ date: item.snapshotDate,
        totalInboundLinks: item.totalInboundLinks, linkedPages: item.linkedPages }))),
      scoreProfilePayload: JSON.stringify(details), requestIdsPayload: JSON.stringify(linkCounts.requestIds), fetchedAt: capturedAt });
    await cleanupExpiredBacklinkCaches();
    return reportFromRow(saved, { cached: false });
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("INTERNAL", "백링크 분석에 실패했습니다.");
    await saveBacklinkReportFailure(lease.row.id, apiError.code, apiError.message);
    if (hasPayload(lease.row)) return reportFromRow(lease.row, { cached: true, warning: apiError.message });
    throw apiError;
  }
}

async function refreshCommonCrawlBacklinkReport(
  auth: AuthContext,
  input: BacklinkReportRequest,
  dependencies: RefreshDependencies,
  fallbackFromBing: boolean,
): Promise<BacklinkReport> {
  const parsed = parseBacklinkTarget(input);
  const lease = await acquireBacklinkRefreshLease({
    workspaceId: auth.workspaceId,
    target: parsed.cacheTarget,
    scope: parsed.scope,
    provider: BACKLINK_COMMON_CRAWL_PROVIDER,
    mode: input.mode,
  });
  if (lease.kind === "fresh") return reportFromRow(lease.row, { cached: true });
  if (lease.kind === "busy") {
    if (hasPayload(lease.row)) return reportFromRow(lease.row, { cached: true, warning: "Common Crawl 최신 데이터를 수집 중이어서 저장된 결과를 표시합니다." });
    throw new ApiError("DUPLICATE", "이 사이트의 Common Crawl 데이터를 이미 수집 중입니다.", { details: { refreshing: true } });
  }
  try {
    const provider = dependencies.commonCrawl ?? new CommonCrawlBacklinkProvider();
    const [discovery, drResult] = await Promise.all([
      provider.discover({ siteUrl: parsed.siteUrl, targetUrl: parsed.targetUrl, scope: parsed.scope, limit: input.limit }),
      domainRating(parsed.siteUrl, dependencies.ahrefs),
    ]);
    const targetCounts = discovery.rows.reduce((map, row) => {
      map.set(row.targetUrl, (map.get(row.targetUrl) ?? 0) + row.linkCount);
      return map;
    }, new Map<string, number>());
    const targetPages = [...targetCounts]
      .map(([url, linkCount]) => ({ kind: "target_pages" as const, url, linkCount }))
      .sort((a, b) => b.linkCount - a.linkCount);
    const totalInboundLinks = discovery.rows.reduce((sum, row) => sum + row.linkCount, 0);
    const capturedAt = new Date();
    await replaceImportedBacklinks(lease.row.id, discovery.rows);
    await saveBacklinkSnapshot({
      workspaceId: auth.workspaceId,
      siteUrl: parsed.siteUrl,
      scope: parsed.scope,
      targetUrl: parsed.targetUrl,
      provider: BACKLINK_COMMON_CRAWL_PROVIDER,
      totalInboundLinks,
      linkedPages: targetPages.length,
      capturedAt,
    });
    const snapshots = await listBacklinkSnapshots({
      workspaceId: auth.workspaceId,
      siteUrl: parsed.siteUrl,
      scope: parsed.scope,
      targetUrl: parsed.targetUrl,
      provider: BACKLINK_COMMON_CRAWL_PROVIDER,
    });
    const previous = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
    const delta = previous?.totalInboundLinks === null || previous?.totalInboundLinks === undefined
      ? null
      : totalInboundLinks - previous.totalInboundLinks;
    const emptyWarning = discovery.rows.length === 0
      ? "최근 Common Crawl 3개 크롤에서 원문 URL까지 확인된 백링크를 찾지 못했습니다."
      : null;
    const coverageWarning = discovery.partial
      ? "Common Crawl은 공개 웹의 일부를 수집하므로 결과가 전체 백링크를 의미하지 않습니다."
      : null;
    const warning = [emptyWarning, coverageWarning, discovery.warning, drResult.warning].filter(Boolean).join(" ") || null;
    const details: ReportDetailsPayload = {
      topTargetPages: targetPages,
      partial: discovery.partial || Boolean(drResult.warning),
      warning,
      domainRatingAttribution: drResult.value === null ? null : AHREFS_ATTRIBUTION,
      domainRatingLicenseUrl: drResult.value === null ? null : drResult.licenseUrl ?? AHREFS_LICENSE_URL,
      commonCrawlRelease: discovery.release,
      fallbackFromBing,
    };
    const saved = await saveBacklinkReportSuccess({
      id: lease.row.id,
      effectiveTarget: parsed.siteUrl,
      overviewPayload: JSON.stringify({
        domainRating: drResult.value,
        totalInboundLinks,
        linkedPages: targetPages.length,
        newLinks: delta === null ? null : Math.max(0, delta),
        lostLinks: delta === null ? null : Math.max(0, -delta),
      }),
      historyPayload: JSON.stringify(snapshots.map((item) => ({
        date: item.snapshotDate,
        totalInboundLinks: item.totalInboundLinks,
        linkedPages: item.linkedPages,
      }))),
      scoreProfilePayload: JSON.stringify(details),
      requestIdsPayload: JSON.stringify(discovery.requestId ? [discovery.requestId] : []),
      fetchedAt: capturedAt,
      ttlMs: COMMON_CRAWL_CACHE_TTL_MS,
    });
    await cleanupExpiredBacklinkCaches();
    return reportFromRow(saved, { cached: false });
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("INTERNAL", "Common Crawl 백링크 분석에 실패했습니다.");
    await saveBacklinkReportFailure(lease.row.id, apiError.code, apiError.message);
    if (hasPayload(lease.row)) return reportFromRow(lease.row, { cached: true, warning: apiError.message });
    throw apiError;
  }
}

export async function refreshBacklinkReport(
  auth: AuthContext,
  input: BacklinkReportRequest,
  dependencies: RefreshDependencies = {},
): Promise<BacklinkReport> {
  if (input.provider === BACKLINK_COMMON_CRAWL_PROVIDER) {
    return refreshCommonCrawlBacklinkReport(auth, input, dependencies, false);
  }
  if (input.provider === BACKLINK_PROVIDER) {
    return refreshBingBacklinkReport(auth, input, dependencies);
  }

  const canUseBing = Boolean(dependencies.bing || await getBingConnection(auth.workspaceId));
  let bingReport: BacklinkReport | null = null;
  if (canUseBing) {
    bingReport = await refreshBingBacklinkReport(auth, input, dependencies);
    if ((bingReport.overview.totalInboundLinks ?? 0) > 0) return bingReport;
  }

  const commonCrawl = dependencies.commonCrawl ?? new CommonCrawlBacklinkProvider();
  if (!commonCrawl.isConfigured()) {
    if (bingReport) {
      return {
        ...bingReport,
        provenance: {
          ...bingReport.provenance,
          warning: [bingReport.provenance.warning, "Common Crawl 역색인 서비스가 설정되지 않아 자동 보완 수집을 건너뛰었습니다."].filter(Boolean).join(" "),
        },
      };
    }
    throw new ApiError("INTERNAL", "Bing 연결 또는 Common Crawl 자동 수집기 설정이 필요합니다.", {
      details: { providerReason: "configuration" },
    });
  }
  try {
    return await refreshCommonCrawlBacklinkReport(auth, input, { ...dependencies, commonCrawl }, Boolean(bingReport));
  } catch (error) {
    if (!bingReport) throw error;
    return {
      ...bingReport,
      provenance: {
        ...bingReport.provenance,
        warning: [bingReport.provenance.warning, error instanceof Error ? error.message : "Common Crawl 자동 보완 수집에 실패했습니다."].filter(Boolean).join(" "),
      },
    };
  }
}

export async function queryBacklinkList(
  auth: AuthContext,
  input: BacklinkListRequest,
  bingOverride?: BingWebmasterProvider,
): Promise<BacklinkListResult> {
  const parsed = parseBacklinkTarget(input);
  if (input.targetPage && !targetBelongsToSite(parsed.siteUrl, input.targetPage)) {
    throw new ApiError("VALIDATION_ERROR", "선택한 대상 페이지가 인증 사이트 범위를 벗어났습니다.");
  }
  const report = await findBacklinkReportCache(auth.workspaceId, parsed.cacheTarget, parsed.scope, input.provider);
  if (!report || !hasPayload(report)) throw new ApiError("NOT_FOUND", "먼저 Bing 또는 Common Crawl 백링크 분석을 실행해 주세요.");
  if (input.provider === BACKLINK_PROVIDER && !(await getBingConnection(auth.workspaceId)) && !bingOverride) {
    throw new ApiError("UNAUTHENTICATED", "Bing 연결이 해제되어 저장된 API 데이터에 접근할 수 없습니다.");
  }
  const sort = resolveBacklinkSort(input.dataset, input.sort);
  const serialized = listQueryKey({ dataset: input.dataset, targetPage: input.targetPage, page: input.page,
    pageSize: input.pageSize, sort, direction: input.direction, filters: input.filters });
  const hash = backlinkQueryHash(serialized);
  const cached = await findFreshBacklinkListCache(report.id, hash);
  if (cached) {
    const providerPages = cached.total < 0 ? -cached.total - 1 : Math.max(1, Math.ceil(cached.total / input.pageSize));
    return listResult({ input, target: parsed, sort, rows: parseJson(cached.rowsPayload, []),
      total: cached.total < 0 ? null : cached.total, totalPages: providerPages, fetchedAt: cached.fetchedAt,
      expiresAt: cached.expiresAt, requestId: cached.requestId, cached: true });
  }

  let rows: BacklinkRow[];
  let total: number | null;
  let totalPages: number;
  let requestId: string | null = null;
  if (input.dataset === "target_pages") {
    const details = parseJson<ReportDetailsPayload>(report.scoreProfilePayload, EMPTY_REPORT_DETAILS);
    const filtered = sortBacklinkRows(filterBacklinkRows(details.topTargetPages, input.filters), input.dataset, sort, input.direction);
    total = filtered.length;
    totalPages = Math.max(1, Math.ceil(total / input.pageSize));
    rows = filtered.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
  } else if (input.provider === BACKLINK_CSV_PROVIDER || input.provider === BACKLINK_COMMON_CRAWL_PROVIDER) {
    const imported = (await listImportedBacklinks(report.id)).filter((row) => row.targetUrl === input.targetPage);
    const filtered = sortBacklinkRows(filterBacklinkRows(imported, input.filters), input.dataset, sort, input.direction);
    total = filtered.length;
    totalPages = Math.max(1, Math.ceil(total / input.pageSize));
    rows = filtered.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
  } else {
    const provider = bingOverride ?? (await activeBingProvider(auth.workspaceId)).provider;
    const result = await provider.getUrlLinks(parsed.siteUrl, input.targetPage!, input.page - 1);
    const filtered = sortBacklinkRows(filterBacklinkRows(result.rows, input.filters), input.dataset, sort, input.direction);
    rows = filtered.slice(0, input.pageSize);
    total = null;
    totalPages = Math.max(1, result.totalPages);
    requestId = result.requestId;
  }
  const saved = await saveBacklinkListCache({ reportId: report.id, dataset: input.dataset, queryHash: hash,
    queryPayload: serialized, rowsPayload: JSON.stringify(rows), total: total === null ? -(totalPages + 1) : total, requestId });
  return listResult({ input, target: parsed, sort, rows, total, totalPages, fetchedAt: saved.fetchedAt,
    expiresAt: saved.expiresAt, requestId, cached: false });
}

function listResult(input: {
  input: BacklinkListRequest;
  target: ReturnType<typeof parseBacklinkTarget>;
  sort: string; rows: BacklinkRow[]; total: number | null; totalPages: number;
  fetchedAt: Date; expiresAt: Date; requestId: string | null; cached: boolean;
}): BacklinkListResult {
  return { siteUrl: input.target.siteUrl, targetUrl: input.target.targetUrl, scope: input.target.scope,
    provider: input.input.provider, dataset: input.input.dataset, targetPage: input.input.targetPage ?? null,
    rows: input.rows, total: input.total, page: input.input.page, pageSize: input.input.pageSize,
    totalPages: input.totalPages, sort: input.sort, direction: input.input.direction,
    provenance: { provider: input.input.provider, fetchedAt: input.fetchedAt.toISOString(),
      expiresAt: input.expiresAt.toISOString(), cached: input.cached, partial: input.total === null, requestId: input.requestId } };
}

export async function previewBacklinkCsv(auth: AuthContext, file: File): Promise<BacklinkImportPreview> {
  if (!file.name.toLowerCase().endsWith(".csv")) throw new ApiError("VALIDATION_ERROR", "CSV 파일만 가져올 수 있습니다.");
  const parsed = parseBacklinkCsv(await file.text());
  const row = await saveBacklinkImportStage({ workspaceId: auth.workspaceId, fileName: file.name,
    fileSha256: parsed.sha256, rawPayload: JSON.stringify(parsed.rows), headersPayload: JSON.stringify(parsed.headers),
    detectedMappingPayload: JSON.stringify(parsed.detectedMapping), rowCount: parsed.rows.length });
  return previewFromParsed({ id: row.id, fileName: row.fileName, parsed, expiresAt: row.expiresAt });
}

export async function commitBacklinkCsv(auth: AuthContext, input: {
  importId: string; siteUrl: string; mapping: BacklinkImportMapping;
}): Promise<{ report: BacklinkReport; importedRows: number; skippedRows: number }> {
  const stage = await getBacklinkImportStage(auth.workspaceId, input.importId);
  const headers = parseJson<string[]>(stage.headersPayload, []);
  const sourceRows = parseJson<string[][]>(stage.rawPayload, []);
  const normalized = normalizeImportedBacklinks({ headers, rows: sourceRows, mapping: input.mapping, siteUrl: input.siteUrl });
  const targetPages = [...normalized.rows.reduce((map, row) => map.set(row.targetUrl, (map.get(row.targetUrl) ?? 0) + row.linkCount), new Map<string, number>())]
    .map(([url, linkCount]) => ({ kind: "target_pages" as const, url, linkCount })).sort((a, b) => b.linkCount - a.linkCount);
  const totalInboundLinks = normalized.rows.reduce((sum, row) => sum + row.linkCount, 0);
  const lease = await acquireBacklinkRefreshLease({ workspaceId: auth.workspaceId, target: normalized.siteUrl,
    scope: "site", provider: BACKLINK_CSV_PROVIDER, mode: "force" });
  if (lease.kind !== "acquired") throw new ApiError("DUPLICATE", "이 CSV를 이미 가져오는 중입니다.");
  try {
    const capturedAt = new Date();
    await replaceImportedBacklinks(lease.row.id, normalized.rows);
    await saveBacklinkSnapshot({ workspaceId: auth.workspaceId, siteUrl: normalized.siteUrl, scope: "site", targetUrl: null,
      provider: BACKLINK_CSV_PROVIDER, totalInboundLinks, linkedPages: targetPages.length, capturedAt });
    const snapshots = await listBacklinkSnapshots({ workspaceId: auth.workspaceId, siteUrl: normalized.siteUrl,
      scope: "site", targetUrl: null, provider: BACKLINK_CSV_PROVIDER });
    const previous = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
    const delta = previous?.totalInboundLinks === null || previous?.totalInboundLinks === undefined ? null : totalInboundLinks - previous.totalInboundLinks;
    const saved = await saveBacklinkReportSuccess({ id: lease.row.id, effectiveTarget: normalized.siteUrl,
      overviewPayload: JSON.stringify({ domainRating: null, totalInboundLinks, linkedPages: targetPages.length,
        newLinks: delta === null ? null : Math.max(0, delta), lostLinks: delta === null ? null : Math.max(0, -delta) }),
      historyPayload: JSON.stringify(snapshots.map((item) => ({ date: item.snapshotDate,
        totalInboundLinks: item.totalInboundLinks, linkedPages: item.linkedPages }))),
      scoreProfilePayload: JSON.stringify({ topTargetPages: targetPages, partial: false, warning: null,
        domainRatingAttribution: null, domainRatingLicenseUrl: null } satisfies ReportDetailsPayload), fetchedAt: capturedAt });
    await deleteBacklinkImportStage(stage.id);
    await cleanupExpiredBacklinkCaches();
    return { report: reportFromRow(saved, { cached: false }), importedRows: normalized.rows.length, skippedRows: normalized.skipped };
  } catch (error) {
    await saveBacklinkReportFailure(lease.row.id, error instanceof ApiError ? error.code : "INTERNAL",
      error instanceof Error ? error.message : "CSV 가져오기에 실패했습니다.");
    throw error;
  }
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function backlinkRowsCsv(rows: BacklinkRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((header) =>
    csvCell((row as unknown as Record<string, unknown>)[header])).join(","))].join("\r\n");
}

export async function exportBacklinkCsv(auth: AuthContext, input: BacklinkListRequest & { limit: 100 | 500 | 1000 }): Promise<string> {
  const rows: BacklinkRow[] = [];
  for (let page = 1; rows.length < input.limit; page += 1) {
    const result = await queryBacklinkList(auth, { ...input, page, pageSize: Math.min(25, input.limit - rows.length) });
    rows.push(...result.rows);
    if (result.rows.length === 0 || page >= result.totalPages) break;
  }
  return backlinkRowsCsv(rows.slice(0, input.limit));
}
