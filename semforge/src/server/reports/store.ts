// @TASK P3-R1-T1 - Tenant-scoped immutable weekly report store
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST src/server/reports/reports.integration.test.ts
import { buildWeeklyReportSchedule } from "@/server/reports/schedule";
import {
  REPORT_SECTION_KEYS,
  type GenerateWeeklyReportInput,
  type ReportDetail,
  type ReportPage,
  type ReportSectionKey,
  type ReportSectionSnapshot,
  type ReportStatus,
  type ReportSummary,
  type WeeklyReportGenerator,
  type WeeklyReportSnapshot,
} from "@/server/reports/types";

export interface ReportSqlClient {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

interface ReportSqlConnection extends ReportSqlClient {
  release(): void;
}

export type ReportSqlSource = ReportSqlClient & {
  connect?: () => Promise<ReportSqlConnection>;
};

export class ReportsStoreError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID_CURSOR", message: string = code) {
    super(message);
    this.name = "ReportsStoreError";
  }
}

type ReportRow = {
  id: string;
  workspace_id: string;
  site_id: string;
  status: ReportStatus;
  period_start: Date | string;
  period_end: Date | string;
  comparison_start: Date | string;
  comparison_end: Date | string;
  snapshot: WeeklyReportSnapshot | string | null;
  brand_name: string;
  logo_url: string | null;
  accent_color: string;
  snapshot_ready_at: Date | string | null;
  delivered_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ReportSectionRow = {
  key: ReportSectionKey;
  available: boolean;
  unavailable_reason: string | null;
  data: Readonly<Record<string, unknown>> | string;
  captured_at: Date | string;
};

type BrandRow = {
  brand_name: string;
  logo_url: string | null;
  accent_color: string;
};

type RankRow = {
  tracked_query_id: string;
  query: string;
  observed_at: Date | string;
  position: number | null;
  result_url: string | null;
  result_title: string | null;
};

type AioRow = {
  id: string;
  tracked_query_id: string;
  query: string;
  observed_at: Date | string;
  presence: "present" | "absent" | "unknown";
  answer_text: string | null;
  citations: unknown[] | string;
};

type NaverRow = {
  tracked_query_id: string;
  query: string;
  observed_at: Date | string;
  collected_at: Date | string;
  monthly_pc_search_volume: number | null;
  monthly_mobile_search_volume: number | null;
  blog_result_count: number | null;
  trend: unknown[] | string | null;
  demographics: Readonly<Record<string, unknown>> | string | null;
};

type GscRow = {
  data_date: Date | string;
  collected_at: Date | string;
  dimensions: Readonly<Record<string, string>> | string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function isoTimestamp(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function calendarDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toSummary(row: ReportRow): ReportSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    siteId: row.site_id,
    status: row.status,
    period: {
      start: calendarDate(row.period_start),
      end: calendarDate(row.period_end),
      comparisonStart: calendarDate(row.comparison_start),
      comparisonEnd: calendarDate(row.comparison_end),
    },
    brand: {
      name: row.brand_name,
      logoUrl: row.logo_url,
      accentColor: row.accent_color,
    },
    snapshotReadyAt: isoTimestamp(row.snapshot_ready_at),
    deliveredAt: isoTimestamp(row.delivered_at),
    createdAt: isoTimestamp(row.created_at)!,
    updatedAt: isoTimestamp(row.updated_at)!,
  };
}

function toSection(row: ReportSectionRow): ReportSectionSnapshot {
  return {
    key: row.key,
    available: row.available,
    unavailableReason: row.unavailable_reason,
    capturedAt: isoTimestamp(row.captured_at)!,
    data: jsonValue(row.data),
  };
}

async function withTransaction<T>(
  source: ReportSqlSource,
  workspaceId: string,
  operation: (db: ReportSqlClient) => Promise<T>,
): Promise<T> {
  const connection = source.connect ? await source.connect() : null;
  const db = connection ?? source;
  try {
    await db.query("begin");
    try {
      await db.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      const result = await operation(db);
      await db.query("commit");
      return result;
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  } finally {
    connection?.release();
  }
}

const REPORT_COLUMNS = `
  id::text, workspace_id::text, site_id::text, status,
  period_start, period_end, comparison_start, comparison_end,
  snapshot, brand_name, logo_url, accent_color,
  snapshot_ready_at, delivered_at, created_at, updated_at`;

async function loadReport(
  db: ReportSqlClient,
  workspaceId: string,
  reportId: string,
): Promise<ReportDetail | null> {
  const report = (
    await db.query<ReportRow>(
      `select ${REPORT_COLUMNS}
         from weekly_reports
        where workspace_id = $1 and id = $2`,
      [workspaceId, reportId],
    )
  ).rows[0];
  if (!report?.snapshot) return null;
  const sections = (
    await db.query<ReportSectionRow>(
      `select key, available, unavailable_reason, data, captured_at
         from report_sections
        where workspace_id = $1 and report_id = $2
        order by case key when 'rank' then 1 when 'aio' then 2 when 'naver' then 3 when 'gsc' then 4 end`,
      [workspaceId, reportId],
    )
  ).rows.map(toSection);
  return {
    ...toSummary(report),
    snapshot: jsonValue(report.snapshot),
    sections,
  };
}

async function existingForPeriod(
  db: ReportSqlClient,
  input: GenerateWeeklyReportInput,
  periodStart: string,
  periodEnd: string,
): Promise<ReportDetail | null> {
  const row = (
    await db.query<{ id: string }>(
      `select id::text from weekly_reports
        where workspace_id = $1 and site_id = $2 and period_start = $3::date and period_end = $4::date`,
      [input.workspaceId, input.siteId, periodStart, periodEnd],
    )
  ).rows[0];
  return row ? loadReport(db, input.workspaceId, row.id) : null;
}

function capturedAt(rows: Array<{ observed_at?: Date | string; collected_at?: Date | string }>): string {
  const timestamps = rows.flatMap((row) => {
    const value = row.collected_at ?? row.observed_at;
    return value === undefined ? [] : [new Date(value).getTime()];
  });
  return new Date(Math.max(...timestamps)).toISOString();
}

function section(
  key: ReportSectionKey,
  snapshotAt: Date,
  rows: Array<{ observed_at?: Date | string; collected_at?: Date | string }>,
  data: Readonly<Record<string, unknown>>,
): ReportSectionSnapshot {
  const available = rows.length > 0;
  return {
    key,
    available,
    unavailableReason: available ? null : "provider_data_missing",
    capturedAt: available ? capturedAt(rows) : snapshotAt.toISOString(),
    data: available ? data : {},
  };
}

async function collectSections(
  db: ReportSqlClient,
  input: GenerateWeeklyReportInput,
  schedule: ReturnType<typeof buildWeeklyReportSchedule>,
): Promise<Record<ReportSectionKey, ReportSectionSnapshot>> {
  const observationBounds = [
    input.workspaceId,
    input.siteId,
    schedule.collectionAt,
    schedule.retryCutoffAt,
  ] as const;
  const rankRows = (
    await db.query<RankRow>(
      `select observation.tracked_query_id::text, query.query, observation.observed_at,
              observation.position, observation.result_url, observation.result_title
         from tracked_queries query
         join lateral (
           select tracked_query_id, observed_at, position, result_url, result_title
             from rank_observations
            where workspace_id = query.workspace_id and tracked_query_id = query.id
              and observed_at >= $3 and observed_at <= $4
            order by observed_at desc limit 1
         ) observation on true
        where query.workspace_id = $1 and query.site_id = $2 and query.type = 'rank' and query.active
        order by query.normalized_query, query.id`,
      observationBounds,
    )
  ).rows;
  const aioRows = (
    await db.query<AioRow>(
      `select observation.id::text, observation.tracked_query_id::text, query.query,
              observation.observed_at, observation.presence, observation.answer_text,
              coalesce((
                select jsonb_agg(jsonb_build_object(
                  'url', citation.url, 'title', citation.title, 'position', citation.position
                ) order by citation.position)
                  from aio_citations citation
                 where citation.workspace_id = observation.workspace_id
                   and citation.observation_id = observation.id
              ), '[]'::jsonb) as citations
         from tracked_queries query
         join lateral (
           select id, workspace_id, tracked_query_id, observed_at, presence, answer_text
             from aio_observations
            where workspace_id = query.workspace_id and tracked_query_id = query.id
              and observed_at >= $3 and observed_at <= $4
            order by observed_at desc limit 1
         ) observation on true
        where query.workspace_id = $1 and query.site_id = $2 and query.type = 'aio' and query.active
        order by query.normalized_query, query.id`,
      observationBounds,
    )
  ).rows;
  const naverRows = (
    await db.query<NaverRow>(
      `select observation.tracked_query_id::text, query.query, observation.observed_at,
              observation.collected_at, observation.monthly_pc_search_volume,
              observation.monthly_mobile_search_volume, observation.blog_result_count,
              observation.trend, observation.demographics
         from tracked_queries query
         join lateral (
           select tracked_query_id, observed_at, collected_at, monthly_pc_search_volume,
                  monthly_mobile_search_volume, blog_result_count, trend, demographics
             from naver_observations
            where workspace_id = query.workspace_id and tracked_query_id = query.id
              and observed_at >= $3 and observed_at <= $4
            order by observed_at desc limit 1
         ) observation on true
        where query.workspace_id = $1 and query.site_id = $2 and query.type = 'rank' and query.active
        order by query.normalized_query, query.id`,
      observationBounds,
    )
  ).rows;
  const gscRows = (
    await db.query<GscRow>(
      `select data_date, collected_at, dimensions, clicks, impressions, ctr, position
         from gsc_observations
        where workspace_id = $1 and site_id = $2
          and data_date between $3::date and $4::date
        order by data_date, dimension_hash`,
      [
        input.workspaceId,
        input.siteId,
        schedule.gsc.comparison.start,
        schedule.gsc.current.end,
      ],
    )
  ).rows;

  const rank = section("rank", schedule.snapshotAt, rankRows, {
    observations: rankRows.map((row) => ({
      trackedQueryId: row.tracked_query_id,
      query: row.query,
      observedAt: isoTimestamp(row.observed_at),
      position: row.position,
      resultUrl: row.result_url,
      resultTitle: row.result_title,
    })),
  });
  const aio = section("aio", schedule.snapshotAt, aioRows, {
    observations: aioRows.map((row) => ({
      trackedQueryId: row.tracked_query_id,
      query: row.query,
      observedAt: isoTimestamp(row.observed_at),
      presence: row.presence,
      answerText: row.answer_text,
      citations: jsonValue(row.citations),
    })),
  });
  const naver = section("naver", schedule.snapshotAt, naverRows, {
    observations: naverRows.map((row) => ({
      trackedQueryId: row.tracked_query_id,
      query: row.query,
      observedAt: isoTimestamp(row.observed_at),
      collectedAt: isoTimestamp(row.collected_at),
      monthlyPcSearchVolume: row.monthly_pc_search_volume,
      monthlyMobileSearchVolume: row.monthly_mobile_search_volume,
      blogResultCount: row.blog_result_count,
      trend: row.trend === null ? null : jsonValue(row.trend),
      demographics: row.demographics === null ? null : jsonValue(row.demographics),
    })),
  });
  const gscData = gscRows.map((row) => ({
    dataDate: calendarDate(row.data_date),
    collectedAt: isoTimestamp(row.collected_at),
    dimensions: jsonValue(row.dimensions),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
  const gsc = section("gsc", schedule.snapshotAt, gscRows, {
    current: gscData.filter(
      (row) => row.dataDate >= schedule.gsc.current.start && row.dataDate <= schedule.gsc.current.end,
    ),
    comparison: gscData.filter(
      (row) =>
        row.dataDate >= schedule.gsc.comparison.start && row.dataDate <= schedule.gsc.comparison.end,
    ),
  });
  return { rank, aio, naver, gsc };
}

export async function generateWeeklyReport(
  source: ReportSqlSource,
  input: GenerateWeeklyReportInput,
): Promise<ReportDetail> {
  const schedule = buildWeeklyReportSchedule(input.cycleMonday);
  return withTransaction(source, input.workspaceId, async (db) => {
    const replay = await existingForPeriod(
      db,
      input,
      schedule.gsc.current.start,
      schedule.gsc.current.end,
    );
    if (replay) return replay;

    const brand = (
      await db.query<BrandRow>(
        `select workspace.name as brand_name, workspace.logo_url, workspace.accent_color
           from sites site
           join workspaces workspace on workspace.id = site.workspace_id
          where site.workspace_id = $1 and site.id = $2 and site.active`,
        [input.workspaceId, input.siteId],
      )
    ).rows[0];
    if (!brand) throw new ReportsStoreError("NOT_FOUND");

    const sections = await collectSections(db, input, schedule);
    const status: ReportStatus = REPORT_SECTION_KEYS.every((key) => sections[key].available)
      ? "snapshot_ready"
      : "partial";
    const snapshot: WeeklyReportSnapshot = {
      version: 1,
      capturedAt: schedule.snapshotAt.toISOString(),
      schedule: {
        timezone: "Asia/Seoul",
        collectionAt: schedule.collectionAt.toISOString(),
        retryCutoffAt: schedule.retryCutoffAt.toISOString(),
        snapshotAt: schedule.snapshotAt.toISOString(),
      },
      period: schedule.gsc,
      brand: {
        name: brand.brand_name,
        logoUrl: brand.logo_url,
        accentColor: brand.accent_color,
      },
      sections,
    };
    const inserted = (
      await db.query<{ id: string }>(
        `insert into weekly_reports
          (workspace_id, site_id, status, period_start, period_end,
           comparison_start, comparison_end, brand_name, logo_url, accent_color)
         values ($1, $2, 'collecting', $3::date, $4::date, $5::date, $6::date, $7, $8, $9)
         on conflict (workspace_id, site_id, period_start, period_end) do nothing
         returning id::text`,
        [
          input.workspaceId,
          input.siteId,
          schedule.gsc.current.start,
          schedule.gsc.current.end,
          schedule.gsc.comparison.start,
          schedule.gsc.comparison.end,
          brand.brand_name,
          brand.logo_url,
          brand.accent_color,
        ],
      )
    ).rows[0];
    if (!inserted) {
      const concurrentReplay = await existingForPeriod(
        db,
        input,
        schedule.gsc.current.start,
        schedule.gsc.current.end,
      );
      if (concurrentReplay) return concurrentReplay;
      throw new Error("concurrent report snapshot was not visible");
    }

    for (const key of REPORT_SECTION_KEYS) {
      const value = sections[key];
      await db.query(
        `insert into report_sections
          (workspace_id, report_id, key, available, unavailable_reason, data, captured_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          input.workspaceId,
          inserted.id,
          key,
          value.available,
          value.unavailableReason,
          JSON.stringify(value.data),
          value.capturedAt,
        ],
      );
    }
    await db.query(
      `update weekly_reports
          set status = $3, snapshot = $4::jsonb, snapshot_ready_at = $5, updated_at = now()
        where workspace_id = $1 and id = $2`,
      [input.workspaceId, inserted.id, status, JSON.stringify(snapshot), schedule.snapshotAt],
    );
    const created = await loadReport(db, input.workspaceId, inserted.id);
    if (!created) throw new Error("created report snapshot could not be loaded");
    return created;
  });
}

function encodeCursor(value: { periodEnd: string; id: string }): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string): { periodEnd: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      periodEnd?: unknown;
      id?: unknown;
    };
    if (
      typeof parsed.periodEnd === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.periodEnd) &&
      typeof parsed.id === "string" &&
      UUID_RE.test(parsed.id)
    ) {
      return { periodEnd: parsed.periodEnd, id: parsed.id };
    }
  } catch {
    // Mapped to a stable API error below.
  }
  throw new ReportsStoreError("INVALID_CURSOR");
}

export async function listReports(
  source: ReportSqlSource,
  input: { workspaceId: string; limit?: number; cursor?: string | null },
): Promise<ReportPage> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  return withTransaction(source, input.workspaceId, async (db) => {
    const result = await db.query<ReportRow>(
      `select ${REPORT_COLUMNS}
         from weekly_reports
        where workspace_id = $1 and snapshot is not null
          and ($2::date is null or (period_end, id) < ($2::date, $3::uuid))
        order by period_end desc, id desc
        limit $4`,
      [input.workspaceId, cursor?.periodEnd ?? null, cursor?.id ?? null, limit + 1],
    );
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      items: rows.map(toSummary),
      nextCursor:
        result.rows.length > limit && last
          ? encodeCursor({ periodEnd: calendarDate(last.period_end), id: last.id })
          : null,
    };
  });
}

export async function getReport(
  source: ReportSqlSource,
  workspaceId: string,
  reportId: string,
): Promise<ReportDetail | null> {
  if (!UUID_RE.test(reportId)) return null;
  return withTransaction(source, workspaceId, (db) => loadReport(db, workspaceId, reportId));
}

export function createPostgresWeeklyReportGenerator(source: ReportSqlSource): WeeklyReportGenerator {
  return {
    generate: (input) => generateWeeklyReport(source, input),
  };
}

