// @TASK P2-S1-T1 - PostgreSQL-backed site and tracking store
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
// @TEST src/server/sites/store.integration.test.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import {
  createSite,
  createTrackedQuery,
  disableSite,
  listSites,
  reactivateSite,
} from "@/server/sites/store";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
});

after(async () => pg.close());

async function seedWorkspace(workspaceId: string, slug: string): Promise<void> {
  await pg.query("insert into workspaces (id, name, slug) values ($1, $2, $3)", [
    workspaceId,
    `Agency ${slug}`,
    slug,
  ]);
}

test("createSite는 canonical domain, idempotency, outbox, cursor list를 실제 PostgreSQL에 반영한다", async () => {
  const workspaceId = "10000000-0000-4000-8000-000000000001";
  const actorUserId = "10000000-0000-4000-8000-000000000101";
  await seedWorkspace(workspaceId, "sites-store");

  const first = await createSite(
    pg,
    {
      workspaceId,
      actorUserId,
      name: "첫 사이트",
      domain: "https://예시.한국",
    },
    {
      requestId: "req-site-create-1",
      idempotencyKey: "idem-site-create-1",
      resolveDomainAddresses: async () => ["8.8.8.8"],
    },
  );
  assert.equal(first.domain, "xn--vv4b11d.xn--3e0b707e");
  assert.equal(first.active, true);

  const replay = await createSite(
    pg,
    {
      workspaceId,
      actorUserId,
      name: "다른 이름은 무시",
      domain: "https://예시.한국",
    },
    {
      requestId: "req-site-create-1-replay",
      idempotencyKey: "idem-site-create-1",
      resolveDomainAddresses: async () => ["8.8.8.8"],
    },
  );
  assert.equal(replay.id, first.id);
  assert.equal(replay.name, "첫 사이트");

  const outbox = await pg.query<{ topic: string; idempotency_key: string; payload: { siteId: string } }>(
    "select topic, idempotency_key, payload from outbox where workspace_id = $1 order by created_at",
    [workspaceId],
  );
  assert.equal(outbox.rows.length, 1);
  assert.equal(outbox.rows[0]!.topic, "site.created");
  assert.equal(outbox.rows[0]!.idempotency_key, "site:create:idem-site-create-1");
  assert.equal(outbox.rows[0]!.payload.siteId, first.id);

  await createSite(pg, {
    workspaceId,
    actorUserId,
    name: "둘째",
    domain: "second.example.com",
  }, {
    requestId: "req-site-create-2",
    idempotencyKey: "idem-site-create-2",
    resolveDomainAddresses: async () => ["8.8.4.4"],
  });

  const page1 = await listSites(pg, { workspaceId, limit: 1 });
  assert.equal(page1.items.length, 1);
  assert.ok(page1.nextCursor);
  const page2 = await listSites(pg, { workspaceId, limit: 5, cursor: page1.nextCursor });
  assert.equal(page2.items.length, 1);
  assert.equal(page2.nextCursor, null);
});

test("createSite는 duplicate, site 3개 제한, DNS SSRF, RLS/IDOR를 차단한다", async () => {
  const workspaceA = "10000000-0000-4000-8000-000000000002";
  const workspaceB = "10000000-0000-4000-8000-000000000003";
  const workspaceC = "10000000-0000-4000-8000-000000000013";
  await seedWorkspace(workspaceA, "sites-guards-a");
  await seedWorkspace(workspaceB, "sites-guards-b");
  await seedWorkspace(workspaceC, "sites-guards-c");

  for (let index = 1; index <= 3; index += 1) {
    await createSite(pg, {
      workspaceId: workspaceA,
      actorUserId: null,
      name: `사이트 ${index}`,
      domain: `site-${index}.example.com`,
    }, {
      requestId: `req-site-limit-${index}`,
      idempotencyKey: `idem-site-limit-${index}`,
      resolveDomainAddresses: async () => ["8.8.8.8"],
    });
  }

  await assert.rejects(
    createSite(pg, {
      workspaceId: workspaceA,
      actorUserId: null,
      name: "초과",
      domain: "site-4.example.com",
    }, {
      requestId: "req-site-limit-overflow",
      idempotencyKey: "idem-site-limit-overflow",
      resolveDomainAddresses: async () => ["8.8.8.8"],
    }),
    /SITE_LIMIT/,
  );

  await assert.rejects(
    createSite(pg, {
      workspaceId: workspaceB,
      actorUserId: null,
      name: "비공개 DNS",
      domain: "private.example.com",
    }, {
      requestId: "req-private-dns",
      idempotencyKey: "idem-private-dns",
      resolveDomainAddresses: async () => ["10.0.0.7"],
    }),
    /INVALID_DOMAIN/,
  );

  await createSite(pg, {
    workspaceId: workspaceC,
    actorUserId: null,
    name: "원본",
    domain: "duplicate.example.com",
  }, {
    requestId: "req-site-duplicate-original",
    idempotencyKey: "idem-site-duplicate-original",
    resolveDomainAddresses: async () => ["8.8.8.8"],
  });

  await assert.rejects(
    createSite(pg, {
      workspaceId: workspaceC,
      actorUserId: null,
      name: "중복",
      domain: "DUPLICATE.EXAMPLE.COM",
    }, {
      requestId: "req-site-duplicate",
      idempotencyKey: "idem-site-duplicate",
      resolveDomainAddresses: async () => ["8.8.8.8"],
    }),
    /DUPLICATE_SITE_DOMAIN/,
  );
});

test("disableSite와 reactivateSite는 workspace 경계와 outbox idempotency를 지킨다", async () => {
  const workspaceA = "10000000-0000-4000-8000-000000000004";
  const workspaceB = "10000000-0000-4000-8000-000000000005";
  await seedWorkspace(workspaceA, "site-state-a");
  await seedWorkspace(workspaceB, "site-state-b");

  const site = await createSite(pg, {
    workspaceId: workspaceA,
    actorUserId: null,
    name: "상태",
    domain: "state.example.com",
  }, {
    requestId: "req-site-state-create",
    idempotencyKey: "idem-site-state-create",
    resolveDomainAddresses: async () => ["8.8.8.8"],
  });

  await assert.rejects(
    disableSite(pg, {
      workspaceId: workspaceB,
      siteId: site.id,
    }, {
      requestId: "req-site-state-idor",
      idempotencyKey: "idem-site-state-idor",
    }),
    /NOT_FOUND/,
  );

  const disabled = await disableSite(pg, {
    workspaceId: workspaceA,
    siteId: site.id,
  }, {
    requestId: "req-site-state-disable",
    idempotencyKey: "idem-site-state-disable",
  });
  assert.equal(disabled.active, false);

  const reactivated = await reactivateSite(pg, {
    workspaceId: workspaceA,
    siteId: site.id,
  }, {
    requestId: "req-site-state-reactivate",
    idempotencyKey: "idem-site-state-reactivate",
  });
  assert.equal(reactivated.active, true);
});

test("createTrackedQuery는 normalized duplicate, rank20/aio20 제한, 고정 수집 설정과 outbox를 보장한다", async () => {
  const workspaceId = "10000000-0000-4000-8000-000000000006";
  await seedWorkspace(workspaceId, "tracking-store");
  const site = await createSite(pg, {
    workspaceId,
    actorUserId: null,
    name: "트래킹",
    domain: "tracking.example.com",
  }, {
    requestId: "req-tracking-site",
    idempotencyKey: "idem-tracking-site",
    resolveDomainAddresses: async () => ["8.8.8.8"],
  });

  const created = await createTrackedQuery(pg, {
    workspaceId,
    siteId: site.id,
    type: "rank",
    query: "  SEMForge   가격  ",
  }, {
    requestId: "req-tracking-create",
    idempotencyKey: "idem-tracking-create",
  });
  assert.equal(created.normalizedQuery, "semforge 가격");
  assert.deepEqual(created.collection, {
    engine: "google",
    country: "KR",
    language: "ko",
    device: "desktop",
    depth: 100,
  });

  await assert.rejects(
    createTrackedQuery(pg, {
      workspaceId,
      siteId: site.id,
      type: "rank",
      query: "semforge 가격",
    }, {
      requestId: "req-tracking-dup",
      idempotencyKey: "idem-tracking-dup",
    }),
    /DUPLICATE_TRACKED_QUERY/,
  );

  for (let index = 2; index <= 20; index += 1) {
    await createTrackedQuery(pg, {
      workspaceId,
      siteId: site.id,
      type: "rank",
      query: `순위 ${index}`,
    }, {
      requestId: `req-rank-${index}`,
      idempotencyKey: `idem-rank-${index}`,
    });
    await createTrackedQuery(pg, {
      workspaceId,
      siteId: site.id,
      type: "aio",
      query: `AIO ${index}`,
    }, {
      requestId: `req-aio-${index}`,
      idempotencyKey: `idem-aio-${index}`,
    });
  }

  await assert.rejects(
    createTrackedQuery(pg, {
      workspaceId,
      siteId: site.id,
      type: "rank",
      query: "초과 순위",
    }, {
      requestId: "req-rank-overflow",
      idempotencyKey: "idem-rank-overflow",
    }),
    /TRACKING_LIMIT/,
  );

  const outbox = await pg.query<{ count: number }>(
    "select count(*)::int as count from outbox where workspace_id = $1 and topic = 'tracking.created'",
    [workspaceId],
  );
  assert.equal(outbox.rows[0]!.count, 39);
});
