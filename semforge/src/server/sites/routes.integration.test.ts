// @TASK P2-S1-T1 - Site and tracking API route contracts
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
// @TEST src/server/sites/routes.integration.test.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { createSitesRouteHandlers } from "@/server/sites/routes";

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

function handlersFor(workspace = workspaceId) {
  return createSitesRouteHandlers({
    db: pg,
    resolveSession: async () => ({ workspaceId: workspace, userId }),
    resolveDomainAddresses: async () => ["8.8.8.8"],
  });
}

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
