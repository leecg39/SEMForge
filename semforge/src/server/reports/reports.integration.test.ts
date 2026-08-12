// @TASK P3-R1-T1 - Immutable weekly report persistence and API contract
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST src/server/reports/store.ts
// @TEST src/server/reports/routes.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import {
  createBillingAccessAuthorizer,
  type BillingAccessAuthorizer,
} from "@/server/billing/access";
import { createReportsRouteHandlers } from "@/server/reports/routes";
import {
  generateWeeklyReport,
  getReport,
} from "@/server/reports/store";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
const userId = "31000000-0000-4000-8000-000000000099";

const allowBillingAccess: BillingAccessAuthorizer = async () => ({
  allowed: true,
  mode: "full",
  reason: "active",
  reportPeriodEndBefore: null,
});

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
});

after(async () => pg.close());

function ids(index: number) {
  const suffix = index.toString().padStart(2, "0");
  return {
    workspaceId: `31000000-0000-4000-8000-0000000000${suffix}`,
    siteId: `32000000-0000-4000-8000-0000000000${suffix}`,
  };
}

async function seedTenant(index: number) {
  const value = ids(index);
  await pg.query(
    `insert into workspaces (id, name, slug, logo_url, accent_color)
     values ($1, $2, $3, $4, '#123456')`,
    [value.workspaceId, `Agency ${index}`, `report-agency-${index}`, `https://cdn.test/logo-${index}.png`],
  );
  await pg.query(
    "insert into sites (id, workspace_id, name, domain) values ($1, $2, $3, $4)",
    [value.siteId, value.workspaceId, `Site ${index}`, `report-${index}.example.com`],
  );
  return value;
}

test("snapshot은 rank/AIO/NAVER/GSC를 한 객체로 동결하고 누락 provider를 수집 시각과 함께 partial로 남긴다", async () => {
  const { workspaceId, siteId } = await seedTenant(1);
  const rankQueryId = "33000000-0000-4000-8000-000000000001";
  await pg.query(
    `insert into tracked_queries (id, workspace_id, site_id, type, query, normalized_query)
     values ($1, $2, $3, 'rank', 'SEM agency', 'sem agency')`,
    [rankQueryId, workspaceId, siteId],
  );
  await pg.query(
    `insert into rank_observations
      (workspace_id, site_id, tracked_query_id, observed_at, position, result_url, result_title)
     values ($1, $2, $3, '2026-08-09T09:30:00.000Z', 3, 'https://report-1.example.com', 'Result')`,
    [workspaceId, siteId, rankQueryId],
  );
  const naverObservation = await pg.query<{ id: string }>(
    `insert into naver_observations
      (workspace_id, site_id, tracked_query_id, observed_at, collected_at)
     values ($1, $2, $3, '2026-08-09T09:30:00.000Z', '2026-08-09T09:31:00.000Z')
     returning id::text as id`,
    [workspaceId, siteId, rankQueryId],
  );
  await pg.query(
    `insert into naver_observation_sources
      (workspace_id, observation_id, source, status, collected_at, error_code)
     values ($1, $2, 'search_ads_monthly_volume', 'failed', '2026-08-09T09:31:00.000Z', 'UPSTREAM')`,
    [workspaceId, naverObservation.rows[0]?.id],
  );

  const report = await generateWeeklyReport(pg, { workspaceId, siteId, cycleMonday: "2026-08-10" });

  assert.equal(report.status, "partial");
  assert.equal(report.brand.name, "Agency 1");
  assert.equal(report.brand.logoUrl, "https://cdn.test/logo-1.png");
  assert.equal(report.brand.accentColor, "#123456");
  assert.deepEqual(report.sections.map((section) => section.key), ["rank", "aio", "naver", "gsc"]);
  assert.equal(report.snapshot.sections.rank.available, true);
  assert.equal(report.snapshot.sections.rank.capturedAt, "2026-08-09T09:30:00.000Z");
  for (const key of ["aio", "naver", "gsc"] as const) {
    assert.equal(report.snapshot.sections[key].available, false);
    assert.equal(report.snapshot.sections[key].unavailableReason, "provider_data_missing");
    assert.equal(report.snapshot.sections[key].capturedAt, "2026-08-09T23:00:00.000Z");
  }
  assert.deepEqual(report.snapshot.sections, Object.fromEntries(report.sections.map((section) => [section.key, section])));
});

test("같은 site+period 재생성은 같은 report를 반환하며 이후 workspace 브랜딩을 소급 반영하지 않는다", async () => {
  const { workspaceId, siteId } = await seedTenant(2);
  const first = await generateWeeklyReport(pg, { workspaceId, siteId, cycleMonday: "2026-08-10" });
  await pg.query(
    "update workspaces set name = 'Changed Agency', logo_url = null, accent_color = '#ABCDEF' where id = $1",
    [workspaceId],
  );
  const replay = await generateWeeklyReport(pg, { workspaceId, siteId, cycleMonday: "2026-08-10" });
  const count = await pg.query<{ count: number }>(
    "select count(*)::int as count from weekly_reports where workspace_id = $1 and site_id = $2",
    [workspaceId, siteId],
  );

  assert.equal(replay.id, first.id);
  assert.deepEqual(replay.brand, first.brand);
  assert.equal(replay.snapshot.capturedAt, first.snapshot.capturedAt);
  assert.equal(count.rows[0]?.count, 1);
});

test("snapshot 준비 후 내용과 section은 DB에서도 봉인되며 delivered report는 삭제할 수 없다", async () => {
  const { workspaceId, siteId } = await seedTenant(3);
  const report = await generateWeeklyReport(pg, { workspaceId, siteId, cycleMonday: "2026-08-10" });

  await assert.rejects(
    pg.query("update weekly_reports set brand_name = 'Tampered' where id = $1", [report.id]),
    /immutable report snapshot/i,
  );
  await assert.rejects(
    pg.query("update report_sections set data = '{\"tampered\":true}'::jsonb where report_id = $1", [report.id]),
    /immutable report sections/i,
  );
  await pg.query(
    "update weekly_reports set status = 'delivered', delivered_at = '2026-08-10T01:00:00.000Z' where id = $1",
    [report.id],
  );
  await assert.rejects(
    pg.query("delete from weekly_reports where id = $1", [report.id]),
    /delivered report cannot be mutated/i,
  );
});

test("GET reports API는 session workspace envelope만 반환하고 다른 tenant report IDOR를 404로 숨긴다", async () => {
  const owner = await seedTenant(4);
  const attacker = await seedTenant(5);
  const report = await generateWeeklyReport(pg, {
    ...owner,
    cycleMonday: "2026-08-10",
  });
  const ownerHandlers = createReportsRouteHandlers({
    db: pg,
    authorizeBilling: allowBillingAccess,
    resolveSession: async () => ({
      workspaceId: owner.workspaceId,
      userId,
      role: "owner",
      requestId: "session-owner",
    }),
  });

  const listResponse = await ownerHandlers.reports.GET(
    new Request("https://app.semforge.test/api/v1/reports", {
      headers: { "x-request-id": "reports-list-request" },
    }),
    undefined,
  );
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  const listEnvelope = (await listResponse.json()) as {
    data: { items: Array<{ id: string }> };
    error: null;
    requestId: string;
  };
  assert.equal(listEnvelope.error, null);
  assert.equal(listEnvelope.requestId, "reports-list-request");
  assert.deepEqual(listEnvelope.data.items.map((item) => item.id), [report.id]);

  const detailResponse = await ownerHandlers.reportById.GET(
    new Request(`https://app.semforge.test/api/v1/reports/${report.id}`, {
      headers: { "x-request-id": "reports-detail-request" },
    }),
    { params: Promise.resolve({ reportId: report.id }) },
  );
  assert.equal(detailResponse.status, 200);
  const detailEnvelope = (await detailResponse.json()) as {
    data: { id: string; snapshot: { version: number } };
    error: null;
  };
  assert.equal(detailEnvelope.data.id, report.id);
  assert.equal(detailEnvelope.data.snapshot.version, 1);

  const attackerHandlers = createReportsRouteHandlers({
    db: pg,
    authorizeBilling: allowBillingAccess,
    resolveSession: async () => ({
      workspaceId: attacker.workspaceId,
      userId,
      role: "owner",
      requestId: "session-attacker",
    }),
  });
  const forbidden = await attackerHandlers.reportById.GET(
    new Request(`https://app.semforge.test/api/v1/reports/${report.id}`),
    { params: Promise.resolve({ reportId: report.id }) },
  );
  assert.equal(forbidden.status, 404);
  assert.equal((await getReport(pg, attacker.workspaceId, report.id)), null);
});

test("past_due grace report 목록은 SQL/pagination에서 현재 기간을 제외하고 실제 과거 detail만 허용한다", async () => {
  const tenant = await seedTenant(6);
  const oldReport = await generateWeeklyReport(pg, {
    ...tenant,
    cycleMonday: "2026-07-27",
  });
  const currentReport = await generateWeeklyReport(pg, {
    ...tenant,
    cycleMonday: "2026-08-10",
  });
  const authorizeBilling = createBillingAccessAuthorizer({
    database: {
      async query<T>() {
        return { rows: [{
          status: "past_due",
          current_period_start: "2026-08-01T00:00:00.000Z",
          current_period_end: "2026-09-01T00:00:00.000Z",
          grace_ends_at: "2026-08-15T00:00:00.000Z",
        }] as T[] };
      },
    },
    clock: () => new Date("2026-08-12T00:00:00.000Z"),
  });
  const handlers = createReportsRouteHandlers({
    db: pg,
    authorizeBilling,
    resolveSession: async () => ({
      workspaceId: tenant.workspaceId,
      userId,
      role: "member",
      requestId: "past-due-report",
    }),
  });

  const list = await handlers.reports.GET(
    new Request("https://app.semforge.test/api/v1/reports?limit=1"),
    undefined,
  );
  assert.equal(list.status, 200);
  const listBody = await list.json() as {
    data: { items: Array<{ id: string }>; nextCursor: string | null };
  };
  assert.deepEqual(listBody.data.items.map((item) => item.id), [oldReport.id]);
  assert.equal(listBody.data.nextCursor, null);

  const oldDetail = await handlers.reportById.GET(
    new Request(`https://app.semforge.test/api/v1/reports/${oldReport.id}`),
    { params: Promise.resolve({ reportId: oldReport.id }) },
  );
  const currentDetail = await handlers.reportById.GET(
    new Request(`https://app.semforge.test/api/v1/reports/${currentReport.id}`),
    { params: Promise.resolve({ reportId: currentReport.id }) },
  );
  assert.equal(oldDetail.status, 200);
  assert.equal(currentDetail.status, 403);
});

test("billing-only report detail은 tenant 실제 report를 먼저 load해 외부 ID는 404로 숨긴다", async () => {
  const owner = await seedTenant(7);
  const attacker = await seedTenant(8);
  const report = await generateWeeklyReport(pg, { ...owner, cycleMonday: "2026-08-10" });
  let authorizations = 0;
  const handlers = createReportsRouteHandlers({
    db: pg,
    authorizeBilling: async () => {
      authorizations += 1;
      return {
        allowed: false,
        mode: "billing_only",
        reason: "payment_required",
        reportPeriodEndBefore: null,
      };
    },
    resolveSession: async () => ({
      workspaceId: attacker.workspaceId,
      userId,
      role: "member",
      requestId: "billing-only-idor",
    }),
  });

  const foreign = await handlers.reportById.GET(
    new Request(`https://app.semforge.test/api/v1/reports/${report.id}`),
    { params: Promise.resolve({ reportId: report.id }) },
  );
  assert.equal(foreign.status, 404);
  assert.equal(authorizations, 0);

  const list = await handlers.reports.GET(
    new Request("https://app.semforge.test/api/v1/reports"),
    undefined,
  );
  assert.equal(list.status, 403);
  assert.equal(authorizations, 1);
});

test("past_due scope에 실제 currentPeriodStart cutoff가 없으면 report 목록을 fail-closed 차단한다", async () => {
  const tenant = await seedTenant(9);
  await generateWeeklyReport(pg, { ...tenant, cycleMonday: "2026-07-27" });
  const handlers = createReportsRouteHandlers({
    db: pg,
    authorizeBilling: async () => ({
      allowed: false,
      mode: "past_reports_only",
      reason: "past_due_grace",
      reportPeriodEndBefore: null,
    }),
    resolveSession: async () => ({
      workspaceId: tenant.workspaceId,
      userId,
      role: "member",
      requestId: "past-due-missing-cutoff",
    }),
  });

  const response = await handlers.reports.GET(
    new Request("https://app.semforge.test/api/v1/reports"),
    undefined,
  );
  assert.equal(response.status, 403);
  const envelope = await response.json() as { data: null; error: { code: string } };
  assert.equal(envelope.data, null);
  assert.equal(envelope.error.code, "FORBIDDEN");
});
