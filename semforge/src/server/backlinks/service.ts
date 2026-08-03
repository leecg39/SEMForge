import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import {
  BACKLINK_PROVIDER,
  type BacklinkListRequest,
  type BacklinkListResult,
  type BacklinkReport,
  type BacklinkRow,
  type BacklinkScope,
} from "@/server/backlinks/contracts";
import { compileBacklinkFilter, listQueryKey, resolveBacklinkSort } from "@/server/backlinks/filters";
import { SemrushBacklinkProvider } from "@/server/backlinks/semrush";
import {
  acquireBacklinkRefreshLease,
  backlinkQueryHash,
  cleanupExpiredBacklinkCaches,
  findBacklinkReportCache,
  findFreshBacklinkListCache,
  saveBacklinkListCache,
  saveBacklinkReportFailure,
  saveBacklinkReportSuccess,
} from "@/server/backlinks/store";
import { parseBacklinkTarget } from "@/server/backlinks/target";
import type { BacklinkReportCache } from "@/db/schema";

function parseJson<T>(payload: string | null, fallback: T): T {
  if (!payload) return fallback;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return fallback;
  }
}

function hasPayload(row: BacklinkReportCache): boolean {
  return Boolean(row.overviewPayload && row.historyPayload && row.scoreProfilePayload && row.fetchedAt);
}

function reportFromRow(
  row: BacklinkReportCache,
  options: { cached: boolean; warning?: string | null } = { cached: true },
): BacklinkReport {
  if (!hasPayload(row) || !row.fetchedAt) {
    throw new ApiError("NOT_FOUND", "저장된 백링크 분석 결과가 없습니다.", {
      details: { cacheMiss: true },
    });
  }
  const expiresAt = row.expiresAt ?? row.fetchedAt;
  const stale = row.status !== "ready" || expiresAt.getTime() <= Date.now();
  return {
    target: row.target,
    effectiveTarget: row.effectiveTarget ?? row.target,
    scope: row.scope,
    overview: parseJson(row.overviewPayload, {
      authorityScore: null,
      backlinks: null,
      referringDomains: null,
      referringPages: null,
      newBacklinks: null,
      lostBacklinks: null,
      followBacklinks: null,
      nofollowBacklinks: null,
      sponsoredBacklinks: null,
      ugcBacklinks: null,
      textBacklinks: null,
      imageBacklinks: null,
      formBacklinks: null,
      frameBacklinks: null,
    }),
    history: parseJson(row.historyPayload, []),
    scoreProfile: parseJson(row.scoreProfilePayload, []),
    provenance: {
      provider: BACKLINK_PROVIDER,
      fetchedAt: row.fetchedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      stale,
      cached: options.cached,
      requestIds: parseJson<string[]>(row.requestIdsPayload, []),
      warning: options.warning ?? (stale ? row.lastErrorMessage ?? "캐시가 만료되었습니다." : null),
    },
  };
}

export async function readCachedBacklinkReport(
  auth: AuthContext,
  rawTarget: string,
  scope: BacklinkScope,
): Promise<BacklinkReport> {
  const target = parseBacklinkTarget(rawTarget, scope);
  const row = await findBacklinkReportCache(auth.workspaceId, target.canonical, target.scope);
  if (!row) {
    throw new ApiError("NOT_FOUND", "저장된 백링크 분석 결과가 없습니다.", {
      details: { cacheMiss: true },
    });
  }
  return reportFromRow(row);
}

function monthRange(now = new Date()): { from: string; to: string } {
  const to = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const from = `${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return { from, to };
}

export async function refreshBacklinkReport(
  auth: AuthContext,
  input: { target: string; scope: BacklinkScope; mode: "if-stale" | "force" },
  provider = new SemrushBacklinkProvider(),
): Promise<BacklinkReport> {
  const parsed = parseBacklinkTarget(input.target, input.scope);
  const lease = await acquireBacklinkRefreshLease({
    workspaceId: auth.workspaceId,
    target: parsed.canonical,
    scope: parsed.scope,
    mode: input.mode,
  });
  if (lease.kind === "fresh") return reportFromRow(lease.row, { cached: true });
  if (lease.kind === "busy") {
    if (hasPayload(lease.row)) {
      return reportFromRow(lease.row, {
        cached: true,
        warning: "최신 데이터를 수집 중이어서 저장된 결과를 표시합니다.",
      });
    }
    throw new ApiError("DUPLICATE", "이 대상의 백링크 데이터를 이미 수집 중입니다.", {
      details: { refreshing: true },
    });
  }

  try {
    const range = monthRange();
    const [overview, history, scoreProfile] = await Promise.all([
      provider.overview(parsed.canonical, parsed.scope),
      provider.history(parsed.canonical, parsed.scope, range.from, range.to),
      provider.scoreProfile(parsed.canonical, parsed.scope),
    ]);
    const requestIds = [overview.requestId, history.requestId, scoreProfile.requestId].filter(
      (value): value is string => Boolean(value),
    );
    const saved = await saveBacklinkReportSuccess({
      id: lease.row.id,
      effectiveTarget:
        overview.effectiveTarget ?? history.effectiveTarget ?? scoreProfile.effectiveTarget ?? parsed.canonical,
      overviewPayload: JSON.stringify(overview.data),
      historyPayload: JSON.stringify(history.data),
      scoreProfilePayload: JSON.stringify(scoreProfile.data),
      requestIdsPayload: JSON.stringify(requestIds),
    });
    await cleanupExpiredBacklinkCaches();
    return reportFromRow(saved, { cached: false });
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("INTERNAL", "백링크 분석에 실패했습니다.");
    await saveBacklinkReportFailure(lease.row.id, apiError.code, apiError.message);
    if (hasPayload(lease.row)) {
      return reportFromRow(lease.row, { cached: true, warning: apiError.message });
    }
    throw apiError;
  }
}

export async function queryBacklinkList(
  auth: AuthContext,
  input: BacklinkListRequest,
  provider = new SemrushBacklinkProvider(),
): Promise<BacklinkListResult> {
  const parsed = parseBacklinkTarget(input.target, input.scope);
  const report = await findBacklinkReportCache(auth.workspaceId, parsed.canonical, parsed.scope);
  if (!report || !hasPayload(report)) {
    throw new ApiError("NOT_FOUND", "먼저 백링크 개요 분석을 실행해 주세요.", {
      details: { cacheMiss: true },
    });
  }

  const sort = resolveBacklinkSort(input.dataset, input.sort);
  const serialized = listQueryKey({
    dataset: input.dataset,
    page: input.page,
    pageSize: input.pageSize,
    sort,
    direction: input.direction,
    filters: input.filters,
  });
  const hash = backlinkQueryHash(serialized);
  const cached = await findFreshBacklinkListCache(report.id, hash);
  if (cached) {
    return listResult({
      input,
      target: parsed.canonical,
      sort,
      rows: parseJson<BacklinkRow[]>(cached.rowsPayload, []),
      total: cached.total,
      fetchedAt: cached.fetchedAt,
      expiresAt: cached.expiresAt,
      requestId: cached.requestId,
      cached: true,
    });
  }

  const result = await provider.list({
    target: parsed.canonical,
    scope: parsed.scope,
    dataset: input.dataset,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
    sort,
    direction: input.direction,
    filter: compileBacklinkFilter(input.dataset, input.filters),
  });
  const saved = await saveBacklinkListCache({
    reportId: report.id,
    dataset: input.dataset,
    queryHash: hash,
    queryPayload: serialized,
    rowsPayload: JSON.stringify(result.data),
    total: result.total ?? result.data.length,
    requestId: result.requestId,
  });
  return listResult({
    input,
    target: parsed.canonical,
    sort,
    rows: result.data,
    total: saved.total,
    fetchedAt: saved.fetchedAt,
    expiresAt: saved.expiresAt,
    requestId: saved.requestId,
    cached: false,
  });
}

function listResult(input: {
  input: BacklinkListRequest;
  target: string;
  sort: string;
  rows: BacklinkRow[];
  total: number;
  fetchedAt: Date;
  expiresAt: Date;
  requestId: string | null;
  cached: boolean;
}): BacklinkListResult {
  return {
    target: input.target,
    scope: input.input.scope,
    dataset: input.input.dataset,
    rows: input.rows,
    total: input.total,
    page: input.input.page,
    pageSize: input.input.pageSize,
    totalPages: Math.max(1, Math.ceil(input.total / input.input.pageSize)),
    sort: input.sort,
    direction: input.input.direction,
    provenance: {
      provider: BACKLINK_PROVIDER,
      fetchedAt: input.fetchedAt.toISOString(),
      expiresAt: input.expiresAt.toISOString(),
      cached: input.cached,
      requestId: input.requestId,
    },
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function backlinkRowsCsv(rows: BacklinkRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell((row as unknown as Record<string, unknown>)[header])).join(",")),
  ].join("\r\n");
}

