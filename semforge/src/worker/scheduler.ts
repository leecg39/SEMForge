// @TASK P3-P1-FIX - PostgreSQL-backed weekly collection scheduler
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/worker/scheduler.test.ts
import type { SqlQueryable } from "@/server/jobs/queue";
import {
  buildWeeklyReportSchedule,
  cycleMondayForReportSnapshotRun,
} from "@/server/reports/schedule";

interface ScheduleInput {
  readonly executedAt: Date;
}

export interface WeeklyScheduleResult {
  readonly google: number;
  readonly naver: number;
  readonly gsc: number;
}

export interface WeeklyReportScheduleResult {
  readonly cycleMonday: string;
  readonly reports: number;
}

type QueryRow = {
  workspace_id: string;
  site_id: string;
  site_domain: string;
  tracked_query_id: string;
  type: "rank" | "aio";
  query: string;
};

type BindingRow = {
  workspace_id: string;
  site_id: string;
  binding_id: string;
};

type ReportSiteRow = {
  workspace_id: string;
  site_id: string;
};

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function monthWindow(value: Date): { start: string; end: string } {
  return {
    start: new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)).toISOString(),
    end: new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1)).toISOString(),
  };
}

function dateOffset(value: Date, days: number): string {
  return isoDay(new Date(value.getTime() + days * 86_400_000));
}

function canonicalQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

// @TASK P5-PRIVACY-FENCE - Schedule only while the workspace is active under a shared fence
async function insertPrivacyFencedOutbox(
  database: SqlQueryable,
  input: {
    readonly workspaceId: string;
    readonly topic: string;
    readonly key: string;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly availableAt?: Date;
  },
): Promise<number> {
  const result = await database.query<{ inserted: number }>(
    `with privacy_lock as materialized (
       select pg_advisory_xact_lock_shared(privacy_workspace_lock_key($1::uuid))
     ), privacy_fence as materialized (
       select privacy.workspace_id
         from workspace_privacy_controls privacy
         cross join privacy_lock
        where privacy.workspace_id = $1::uuid and privacy.state = 'active'
     ), inserted as (
       insert into outbox
         (workspace_id, topic, payload, idempotency_key, available_at)
       select $1::uuid, $2::text, $3::jsonb, $4::text,
              coalesce($5::timestamptz, now())
         from privacy_fence
       on conflict (workspace_id, topic, idempotency_key) do nothing
       returning 1
     ) select count(*)::int as inserted from inserted`,
    [
      input.workspaceId,
      input.topic,
      JSON.stringify(input.payload),
      input.key,
      input.availableAt ?? null,
    ],
  );
  return result.rows[0]?.inserted ?? 0;
}

export class PostgresWeeklyCollectionScheduler {
  constructor(private readonly database: SqlQueryable) {}

  async schedule(input: ScheduleInput): Promise<WeeklyScheduleResult> {
    if (!Number.isFinite(input.executedAt.getTime())) throw new TypeError("executedAt is invalid");
    const executedAt = input.executedAt.toISOString();
    const scheduleKey = isoDay(input.executedAt);
    const window = monthWindow(input.executedAt);
    const reservationExpiresAt = new Date(input.executedAt.getTime() + 86_400_000).toISOString();
    const queryRows = await this.database.query<QueryRow>(
      `select query.workspace_id::text, query.site_id::text, site.domain as site_domain,
              query.id::text as tracked_query_id, query.type, query.query
         from tracked_queries query
         join sites site on site.workspace_id = query.workspace_id and site.id = query.site_id
         join subscriptions subscription on subscription.workspace_id = query.workspace_id
         join workspace_privacy_controls privacy
           on privacy.workspace_id = query.workspace_id and privacy.state = 'active'
        where query.active and site.active
          and (
            subscription.status = 'active'
            or (
              subscription.status = 'cancel_at_period_end'
              and subscription.current_period_end > $1::timestamptz
            )
          )
        order by query.workspace_id, query.site_id, query.type asc, query.normalized_query, query.id`,
      [executedAt],
    );
    const bindings = await this.database.query<BindingRow>(
      `select binding.workspace_id::text, binding.site_id::text, binding.id::text as binding_id
         from gsc_property_bindings binding
         join sites site on site.workspace_id = binding.workspace_id and site.id = binding.site_id
         join subscriptions subscription on subscription.workspace_id = binding.workspace_id
         join workspace_privacy_controls privacy
           on privacy.workspace_id = binding.workspace_id and privacy.state = 'active'
        where site.active
          and (
            subscription.status = 'active'
            or (
              subscription.status = 'cancel_at_period_end'
              and subscription.current_period_end > $1::timestamptz
            )
          )
        order by binding.workspace_id, binding.site_id, binding.id`,
      [executedAt],
    );

    let google = 0;
    let naver = 0;
    let gsc = 0;
    const bySite = new Map<string, QueryRow[]>();
    for (const row of queryRows.rows) {
      const key = `${row.workspace_id}:${row.site_id}`;
      bySite.set(key, [...(bySite.get(key) ?? []), row]);
    }
    for (const rows of bySite.values()) {
      const first = rows[0]!;
      const grouped = new Map<string, QueryRow[]>();
      for (const row of rows) {
        const normalized = canonicalQuery(row.query).toLocaleLowerCase("ko-KR");
        grouped.set(normalized, [...(grouped.get(normalized) ?? []), row]);
      }
      const billableUnits = [...grouped.values()].reduce(
        (total, groupedRows) => total + (groupedRows.some((row) => row.type === "aio") ? 2 : 1),
        0,
      );
      google += await this.insertOutbox({
        workspaceId: first.workspace_id,
        topic: "collection.google.weekly",
        key: `weekly:${scheduleKey}:google:${first.site_id}`,
        payload: {
          siteId: first.site_id,
          siteDomain: first.site_domain,
          observedAt: executedAt,
          periodStart: window.start,
          periodEnd: window.end,
          reservationExpiresAt,
          maxProviderCalls: grouped.size,
          maxBillableUnits: billableUnits,
          queries: rows.map((row) => ({
            workspaceId: row.workspace_id,
            siteId: row.site_id,
            trackedQueryId: row.tracked_query_id,
            type: row.type,
            query: canonicalQuery(row.query),
          })),
        },
      });
      for (const row of rows.filter((candidate) => candidate.type === "rank")) {
        naver += await this.insertOutbox({
          workspaceId: row.workspace_id,
          topic: "collection.naver.weekly",
          key: `weekly:${scheduleKey}:naver:${row.tracked_query_id}`,
          payload: {
            workspaceId: row.workspace_id,
            siteId: row.site_id,
            trackedQueryId: row.tracked_query_id,
            query: canonicalQuery(row.query),
            observedAt: executedAt,
            range: {
              startDate: dateOffset(input.executedAt, -6),
              endDate: scheduleKey,
              timeUnit: "date",
            },
            callBudget: { maxCalls: 16 },
          },
        });
      }
    }
    for (const binding of bindings.rows) {
      gsc += await this.insertOutbox({
        workspaceId: binding.workspace_id,
        topic: "collection.gsc.weekly",
        key: `weekly:${scheduleKey}:gsc:${binding.binding_id}`,
        payload: {
          siteId: binding.site_id,
          bindingId: binding.binding_id,
          executedAt,
        },
      });
    }
    return { google, naver, gsc };
  }

  private async insertOutbox(input: {
    workspaceId: string;
    topic: string;
    key: string;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<number> {
    return insertPrivacyFencedOutbox(this.database, input);
  }
}

export class PostgresWeeklyReportScheduler {
  constructor(private readonly database: SqlQueryable) {}

  async schedule(input: ScheduleInput): Promise<WeeklyReportScheduleResult> {
    const cycleMonday = cycleMondayForReportSnapshotRun(input.executedAt);
    const schedule = buildWeeklyReportSchedule(cycleMonday);
    const candidates = await this.database.query<ReportSiteRow>(
      `select site.workspace_id::text, site.id::text as site_id
         from sites site
         join subscriptions subscription on subscription.workspace_id = site.workspace_id
         join workspace_privacy_controls privacy
           on privacy.workspace_id = site.workspace_id and privacy.state = 'active'
        where site.active
          and (
            subscription.status = 'active'
            or (
              subscription.status = 'cancel_at_period_end'
              and subscription.current_period_end > $1::timestamptz
            )
          )
        order by site.workspace_id, site.id`,
      [input.executedAt.toISOString()],
    );
    let reports = 0;
    for (const candidate of candidates.rows) {
      reports += await insertPrivacyFencedOutbox(this.database, {
        workspaceId: candidate.workspace_id,
        topic: "report.snapshot",
        key: `weekly:report:${cycleMonday}:${candidate.site_id}`,
        payload: { siteId: candidate.site_id, cycleMonday },
        availableAt: schedule.snapshotAt,
      });
    }
    return { cycleMonday, reports };
  }
}
