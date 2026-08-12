// @TASK P2-S1-T1 - Site and tracking API route contracts
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
// @TEST src/server/sites/routes.integration.test.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { BillingAccessAuthorizer } from "@/server/billing/access";
import {
  WorkspacePrivacyOperationBlockedError,
  type WorkspacePrivacyOperationGuard,
} from "@/server/privacy/operation";
import {
  createRuntimeSitesRouteHandlers,
  createSitesRouteHandlers,
} from "@/server/sites/routes";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

const workspaceId = "20000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "20000000-0000-4000-8000-000000000002";
const userId = "20000000-0000-4000-8000-000000000101";

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'Route Agency', 'route-agency'), ($2, 'Other', 'other-route')",
    [workspaceId, otherWorkspaceId],
  );
});

after(async () => pg.close());

const allowBillingAccess: BillingAccessAuthorizer = async () => ({
  allowed: true,
  mode: "full",
  reason: "active",
  reportPeriodEndBefore: null,
});

const allowPrivacyOperation: WorkspacePrivacyOperationGuard = {
  async withShared(_workspaceId, operation) {
    return operation(pg);
  },
};

function blockedPrivacyOperation(
  state: "blocking" | "erased",
): WorkspacePrivacyOperationGuard {
  return {
    async withShared() {
      throw new WorkspacePrivacyOperationBlockedError(state);
    },
  };
}

function handlersFor(
  workspace = workspaceId,
  authorizeBilling: BillingAccessAuthorizer = allowBillingAccess,
  privacyOperation: WorkspacePrivacyOperationGuard = allowPrivacyOperation,
) {
  return createSitesRouteHandlers({
    db: pg,
    authorizeBilling,
    privacyOperation,
    resolveSession: async () => ({
      workspaceId: workspace,
      userId,
      role: "owner",
      requestId: "route-test-session",
    }),
    resolveDomainAddresses: async () => ["8.8.8.8"],
  });
}

test("production site/tracking route composition은 concrete privacy guard를 지연 생성한다", () => {
  assert.doesNotThrow(() => createRuntimeSitesRouteHandlers());
});

test("동적 route wrapper는 Next의 params context를 내부 handler에 보존한다", async () => {
  const siteId = "20000000-0000-4000-8000-000000000041";
  await pg.query(
    "insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Wrapped Site', 'wrapped.example.com')",
    [siteId, workspaceId],
  );
  const handlers = handlersFor();
  const wrappedPatch = async (
    request: Request,
    context: { params: Promise<{ siteId: string }> },
  ) => handlers.siteById.PATCH(request, context);

  const response = await wrappedPatch(
    new Request(`https://app.semforge.test/api/v1/sites/${siteId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "wrapped-site-disable",
      },
      body: JSON.stringify({ active: false }),
    }),
    { params: Promise.resolve({ siteId }) },
  );
  assert.equal(response.status, 200);
  assert.equal(((await readEnvelope(response)).data as { active: boolean }).active, false);
});

test("account_created는 sites/tracking read와 write 직접 API 우회를 403 envelope로 차단한다", async () => {
  const deniedCalls: string[] = [];
  const handlers = handlersFor(workspaceId, async ({ capability }) => {
    deniedCalls.push(capability);
    return {
      allowed: false,
      mode: "billing_only",
      reason: "payment_required",
      reportPeriodEndBefore: null,
    };
  });
  const create = await handlers.sites.POST(
    new Request("https://app.semforge.test/api/v1/sites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "unpaid-site-create",
      },
      body: JSON.stringify({ name: "Unpaid", domain: "unpaid.example.com" }),
    }),
    undefined,
  );
  const list = await handlers.sites.GET(
    new Request("https://app.semforge.test/api/v1/sites"),
    undefined,
  );
  const tracking = await handlers.tracking.POST(
    new Request("https://app.semforge.test/api/v1/tracking", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "unpaid-tracking-create",
      },
      body: JSON.stringify({
        siteId: "20000000-0000-4000-8000-000000000099",
        type: "rank",
        query: "Unpaid",
      }),
    }),
    undefined,
  );

  for (const response of [create, list, tracking]) {
    assert.equal(response.status, 403);
    assert.equal((await readEnvelope(response)).error?.code, "FORBIDDEN");
  }
  assert.deepEqual(deniedCalls, ["workspace:write", "workspace:read", "workspace:write"]);
});

async function readEnvelope(response: Response): Promise<{
  data: unknown;
  error: null | { code: string; message: string };
  requestId: string;
}> {
  return response.json() as Promise<{
    data: unknown;
    error: null | { code: string; message: string };
    requestId: string;
  }>;
}

test("POST /api/v1/sites는 Idempotency-Key를 요구하고 생성 결과를 envelope로 반환한다", async () => {
  const handlers = handlersFor();
  const missingKey = await handlers.sites.POST(
    new Request("https://app.semforge.test/api/v1/sites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
      },
      body: JSON.stringify({ name: "Route Site", domain: "route.example.com" }),
    }),
    undefined,
  );
  assert.equal(missingKey.status, 400);
  assert.equal((await readEnvelope(missingKey)).error?.code, "BAD_REQUEST");

  const created = await handlers.sites.POST(
    new Request("https://app.semforge.test/api/v1/sites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "route-site-create-1",
        "x-request-id": "route-sites-create",
      },
      body: JSON.stringify({ name: "Route Site", domain: "route.example.com" }),
    }),
    undefined,
  );
  assert.equal(created.status, 201);
  const envelope = await readEnvelope(created);
  assert.equal(envelope.error, null);
  assert.equal(envelope.requestId, "route-sites-create");
  assert.equal((envelope.data as { domain: string }).domain, "route.example.com");
});

test("admin은 사이트와 추적 항목을 생성하고 활성 상태를 수정할 수 있다", async () => {
  const handlers = createSitesRouteHandlers({
    db: pg,
    authorizeBilling: allowBillingAccess,
    privacyOperation: allowPrivacyOperation,
    resolveSession: async () => ({
      workspaceId,
      userId,
      role: "admin",
      requestId: "admin-route-session",
    }),
    resolveDomainAddresses: async () => ["8.8.8.8"],
  });
  const createdSite = await handlers.sites.POST(
    new Request("https://app.semforge.test/api/v1/sites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "admin-site-create",
      },
      body: JSON.stringify({ name: "Admin Site", domain: "admin.example.com" }),
    }),
    undefined,
  );
  assert.equal(createdSite.status, 201);
  const site = (await readEnvelope(createdSite)).data as { id: string; active: boolean };

  const createdTracking = await handlers.tracking.POST(
    new Request("https://app.semforge.test/api/v1/tracking", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "admin-tracking-create",
      },
      body: JSON.stringify({ siteId: site.id, type: "rank", query: "admin capability" }),
    }),
    undefined,
  );
  assert.equal(createdTracking.status, 201);
  const tracking = (await readEnvelope(createdTracking)).data as { id: string; active: boolean };

  const disabledSite = await handlers.siteById.PATCH(
    new Request(`https://app.semforge.test/api/v1/sites/${site.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "admin-site-disable",
      },
      body: JSON.stringify({ active: false }),
    }),
    { params: Promise.resolve({ siteId: site.id }) },
  );
  const disabledTracking = await handlers.trackingById.PATCH(
    new Request(`https://app.semforge.test/api/v1/tracking/${tracking.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "admin-tracking-disable",
      },
      body: JSON.stringify({ active: false }),
    }),
    { params: Promise.resolve({ trackingId: tracking.id }) },
  );

  assert.equal(disabledSite.status, 200);
  assert.equal(disabledTracking.status, 200);
  assert.equal(((await readEnvelope(disabledSite)).data as { active: boolean }).active, false);
  assert.equal(((await readEnvelope(disabledTracking)).data as { active: boolean }).active, false);
});

test("GET /api/v1/sites는 cursor 페이지를 workspace 내부로만 반환한다", async () => {
  const handlers = handlersFor();
  const page = await handlers.sites.GET(
    new Request("https://app.semforge.test/api/v1/sites?limit=1", {
      headers: { "x-request-id": "route-sites-list" },
    }),
    undefined,
  );
  assert.equal(page.status, 200);
  const envelope = await readEnvelope(page);
  assert.equal(envelope.error, null);
  assert.equal((envelope.data as { items: unknown[] }).items.length, 1);
});

test("privacy operation DI 누락은 read/write 모두 fail-closed로 막는다", async () => {
  const before = (
    await pg.query<{ sites: number; outbox: number }>(
      `select
         (select count(*)::int from sites where workspace_id = $1) sites,
         (select count(*)::int from outbox where workspace_id = $1) outbox`,
      [workspaceId],
    )
  ).rows[0]!;
  const handlers = createSitesRouteHandlers({
    db: pg,
    authorizeBilling: allowBillingAccess,
    resolveSession: async () => ({
      workspaceId,
      userId,
      role: "owner",
      requestId: "missing-privacy-operation",
    }),
    resolveDomainAddresses: async () => ["8.8.8.8"],
  });

  const read = await handlers.sites.GET(
    new Request("https://app.semforge.test/api/v1/sites"),
    undefined,
  );
  const write = await handlers.sites.POST(
    new Request("https://app.semforge.test/api/v1/sites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "missing-privacy-operation",
      },
      body: JSON.stringify({ name: "Must Not Persist", domain: "missing-guard.example.com" }),
    }),
    undefined,
  );
  assert.equal(read.status, 500);
  assert.equal((await readEnvelope(read)).error?.code, "INTERNAL");
  assert.equal(write.status, 500);
  assert.equal((await readEnvelope(write)).error?.code, "INTERNAL");

  const afterState = (
    await pg.query<typeof before>(
      `select
         (select count(*)::int from sites where workspace_id = $1) sites,
         (select count(*)::int from outbox where workspace_id = $1) outbox`,
      [workspaceId],
    )
  ).rows[0]!;
  assert.deepEqual(afterState, before);
});

test("blocking/erased workspace read/write는 사이트·tracking 저장과 outbox 없이 409로 차단된다", async () => {
  const activeSiteId = "20000000-0000-4000-8000-000000000021";
  const inactiveSiteId = "20000000-0000-4000-8000-000000000022";
  const activeTrackingId = "20000000-0000-4000-8000-000000000031";
  const inactiveTrackingId = "20000000-0000-4000-8000-000000000032";
  await pg.query(
    `insert into sites (id, workspace_id, name, domain, active) values
       ($1, $3, 'Privacy Active Site', 'privacy-active.example.com', true),
       ($2, $3, 'Privacy Inactive Site', 'privacy-inactive.example.com', false)`,
    [activeSiteId, inactiveSiteId, workspaceId],
  );
  await pg.query(
    `insert into tracked_queries
       (id, workspace_id, site_id, type, query, normalized_query, active) values
       ($1, $3, $4, 'rank', 'Privacy Active', 'privacy active', true),
       ($2, $3, $4, 'aio', 'Privacy Inactive', 'privacy inactive', false)`,
    [activeTrackingId, inactiveTrackingId, workspaceId, activeSiteId],
  );

  const before = (
    await pg.query<{
      sites: number;
      tracking: number;
      outbox: number;
      active_site: boolean;
      inactive_site: boolean;
      active_tracking: boolean;
      inactive_tracking: boolean;
    }>(
      `select
         (select count(*)::int from sites where workspace_id = $1) sites,
         (select count(*)::int from tracked_queries where workspace_id = $1) tracking,
         (select count(*)::int from outbox where workspace_id = $1) outbox,
         (select active from sites where id = $2) active_site,
         (select active from sites where id = $3) inactive_site,
         (select active from tracked_queries where id = $4) active_tracking,
         (select active from tracked_queries where id = $5) inactive_tracking`,
      [workspaceId, activeSiteId, inactiveSiteId, activeTrackingId, inactiveTrackingId],
    )
  ).rows[0]!;

  for (const state of ["blocking", "erased"] as const) {
    const billingCalls: string[] = [];
    const handlers = handlersFor(
      workspaceId,
      async ({ capability }) => {
        billingCalls.push(capability);
        return {
          allowed: true,
          mode: "full",
          reason: "active",
          reportPeriodEndBefore: null,
        };
      },
      blockedPrivacyOperation(state),
    );
    const suffix = state === "blocking" ? "blocked" : "erased";
    const responses = [
      await handlers.sites.POST(
        new Request("https://app.semforge.test/api/v1/sites", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://app.semforge.test",
            "idempotency-key": `privacy-site-create-${suffix}`,
          },
          body: JSON.stringify({
            name: `Privacy ${state}`,
            domain: `privacy-${suffix}.example.com`,
          }),
        }),
        undefined,
      ),
      await handlers.siteById.PATCH(
        mutationRequest(`/api/v1/sites/${activeSiteId}`, false, `privacy-site-disable-${suffix}`),
        { params: Promise.resolve({ siteId: activeSiteId }) },
      ),
      await handlers.siteById.PATCH(
        mutationRequest(`/api/v1/sites/${inactiveSiteId}`, true, `privacy-site-reactivate-${suffix}`),
        { params: Promise.resolve({ siteId: inactiveSiteId }) },
      ),
      await handlers.tracking.POST(
        new Request("https://app.semforge.test/api/v1/tracking", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://app.semforge.test",
            "idempotency-key": `privacy-tracking-create-${suffix}`,
          },
          body: JSON.stringify({
            siteId: activeSiteId,
            type: "rank",
            query: `Privacy ${state}`,
          }),
        }),
        undefined,
      ),
      await handlers.trackingById.PATCH(
        mutationRequest(
          `/api/v1/tracking/${activeTrackingId}`,
          false,
          `privacy-tracking-disable-${suffix}`,
        ),
        { params: Promise.resolve({ trackingId: activeTrackingId }) },
      ),
      await handlers.trackingById.PATCH(
        mutationRequest(
          `/api/v1/tracking/${inactiveTrackingId}`,
          true,
          `privacy-tracking-reactivate-${suffix}`,
        ),
        { params: Promise.resolve({ trackingId: inactiveTrackingId }) },
      ),
    ];
    for (const response of responses) {
      assert.equal(response.status, 409);
      assert.equal((await readEnvelope(response)).error?.code, "CONFLICT");
    }

    const list = await handlers.sites.GET(
      new Request("https://app.semforge.test/api/v1/sites?limit=50"),
      undefined,
    );
    const detail = await handlers.siteById.GET(
      new Request(`https://app.semforge.test/api/v1/sites/${activeSiteId}`),
      { params: Promise.resolve({ siteId: activeSiteId }) },
    );
    assert.equal(list.status, 409);
    assert.equal((await readEnvelope(list)).error?.code, "CONFLICT");
    assert.equal(detail.status, 409);
    assert.equal((await readEnvelope(detail)).error?.code, "CONFLICT");
    assert.deepEqual(billingCalls, []);
  }

  const afterState = (
    await pg.query<typeof before>(
      `select
         (select count(*)::int from sites where workspace_id = $1) sites,
         (select count(*)::int from tracked_queries where workspace_id = $1) tracking,
         (select count(*)::int from outbox where workspace_id = $1) outbox,
         (select active from sites where id = $2) active_site,
         (select active from sites where id = $3) inactive_site,
         (select active from tracked_queries where id = $4) active_tracking,
         (select active from tracked_queries where id = $5) inactive_tracking`,
      [workspaceId, activeSiteId, inactiveSiteId, activeTrackingId, inactiveTrackingId],
    )
  ).rows[0]!;
  assert.deepEqual(afterState, before);
  await pg.query("delete from tracked_queries where id = any($1::uuid[])", [
    [activeTrackingId, inactiveTrackingId],
  ]);
  await pg.query("delete from sites where id = any($1::uuid[])", [
    [activeSiteId, inactiveSiteId],
  ]);
});

function mutationRequest(pathname: string, active: boolean, idempotencyKey: string) {
  return new Request(`https://app.semforge.test${pathname}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: "https://app.semforge.test",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ active }),
  });
}

test("PATCH /api/v1/sites/[siteId]와 /tracking/[trackingId]는 다른 workspace IDOR를 NOT_FOUND로 막는다", async () => {
  const ownerHandlers = handlersFor();
  const createdSite = await readEnvelope(
    await ownerHandlers.sites.POST(
      new Request("https://app.semforge.test/api/v1/sites", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.semforge.test",
          "idempotency-key": "route-idor-site",
        },
        body: JSON.stringify({ name: "IDOR", domain: "idor.example.com" }),
      }),
      undefined,
    ),
  );
  const siteId = (createdSite.data as { id: string }).id;
  const createdTracking = await readEnvelope(
    await ownerHandlers.tracking.POST(
      new Request("https://app.semforge.test/api/v1/tracking", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.semforge.test",
          "idempotency-key": "route-idor-tracking",
        },
        body: JSON.stringify({ siteId, type: "rank", query: "IDOR Query" }),
      }),
      undefined,
    ),
  );
  const trackingId = (createdTracking.data as { id: string }).id;

  const attackerHandlers = handlersFor(otherWorkspaceId);
  const sitePatch = await attackerHandlers.siteById.PATCH(
    new Request(`https://app.semforge.test/api/v1/sites/${siteId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "route-site-idor-disable",
      },
      body: JSON.stringify({ active: false }),
    }),
    { params: Promise.resolve({ siteId }) },
  );
  assert.equal(sitePatch.status, 404);

  const trackingPatch = await attackerHandlers.trackingById.PATCH(
    new Request(`https://app.semforge.test/api/v1/tracking/${trackingId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "idempotency-key": "route-tracking-idor-disable",
      },
      body: JSON.stringify({ active: false }),
    }),
    { params: Promise.resolve({ trackingId }) },
  );
  assert.equal(trackingPatch.status, 404);
});

test("GET /api/v1/sites/[siteId]는 비활성 tracking까지 포함한 현재 상태와 활성 GSC binding만 tenant 내에 반환한다", async () => {
  const siteId = "20000000-0000-4000-8000-000000000011";
  const connectionId = "20000000-0000-4000-8000-000000000012";
  const bindingId = "20000000-0000-4000-8000-000000000013";
  await pg.query(
    "insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Detail Site', 'detail.example.com')",
    [siteId, workspaceId],
  );
  for (let index = 1; index <= 20; index += 1) {
    const suffix = index.toString().padStart(2, "0");
    await pg.query(
      `insert into tracked_queries
         (id, workspace_id, site_id, type, query, normalized_query, active)
       values ($1, $2, $3, 'rank', $4, $5, true)`,
      [
        `21000000-0000-4000-8000-0000000000${suffix}`,
        workspaceId,
        siteId,
        `Rank ${index}`,
        `rank ${index}`,
      ],
    );
  }
  await pg.query(
    `insert into tracked_queries
       (id, workspace_id, site_id, type, query, normalized_query, active)
     values
       ('22000000-0000-4000-8000-000000000001', $1, $2, 'rank', 'Disabled Rank', 'disabled rank', false),
       ('22000000-0000-4000-8000-000000000002', $1, $2, 'aio', 'Disabled AIO', 'disabled aio', false)`,
    [workspaceId, siteId],
  );
  await pg.query(
    `insert into gsc_connections
       (id, workspace_id, label, access_token_encrypted, refresh_token_encrypted, token_expires_at)
     values ($1, $2, 'Detail GSC', 'enc:v1:key:iv:tag:cipher', 'enc:v1:key:iv:tag:cipher', $3)`,
    [connectionId, workspaceId, new Date("2026-09-01T00:00:00.000Z")],
  );
  await pg.query(
    `insert into gsc_property_bindings
       (id, workspace_id, site_id, connection_id, property_uri)
     values ($1, $2, $3, $4, 'sc-domain:detail.example.com')`,
    [bindingId, workspaceId, siteId, connectionId],
  );

  const response = await handlersFor().siteById.GET(
    new Request(`https://app.semforge.test/api/v1/sites/${siteId}`),
    { params: Promise.resolve({ siteId }) },
  );
  assert.equal(response.status, 200);
  const envelope = await readEnvelope(response);
  const detail = envelope.data as {
    site: { id: string };
    tracking: {
      rank: Array<{ id: string; active: boolean }>;
      aio: Array<{ id: string; active: boolean }>;
    };
    gscBinding: {
      id: string;
      workspaceId: string;
      siteId: string;
      connectionId: string;
      propertyUri: string;
      createdAt: string;
    } | null;
  };
  assert.equal(detail.site.id, siteId);
  assert.equal(detail.tracking.rank.length, 21);
  assert.equal(detail.tracking.rank.filter((item) => item.active).length, 20);
  assert.equal(detail.tracking.aio.length, 1);
  assert.equal(detail.tracking.aio[0]?.active, false);
  assert.deepEqual(detail.gscBinding, {
    id: bindingId,
    workspaceId,
    siteId,
    connectionId,
    propertyUri: "sc-domain:detail.example.com",
    createdAt: detail.gscBinding?.createdAt,
  });

  const crossTenant = await handlersFor(otherWorkspaceId).siteById.GET(
    new Request(`https://app.semforge.test/api/v1/sites/${siteId}`),
    { params: Promise.resolve({ siteId }) },
  );
  assert.equal(crossTenant.status, 404);

  await pg.query("update gsc_connections set disconnected_at = now() where id = $1", [connectionId]);
  const disconnected = await handlersFor().siteById.GET(
    new Request(`https://app.semforge.test/api/v1/sites/${siteId}`),
    { params: Promise.resolve({ siteId }) },
  );
  assert.equal(
    ((await readEnvelope(disconnected)).data as { gscBinding: unknown }).gscBinding,
    null,
  );
});
