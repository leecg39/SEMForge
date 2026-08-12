import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { Pool } from "pg";

import { defineJobHandler, jobSucceeded } from "@/server/jobs/contracts";
import { createReportDeliveryService, type ReportEmailSendInput } from "@/server/reports/delivery/service";
import { PostgresReportDeliveryStore } from "@/server/reports/delivery/store";
import { createReportGenerationJobHandler } from "@/server/reports/job-handler";
import type { ReportPdfRenderer } from "@/server/reports/rendering/pdf";
import { snapshotSha256 } from "@/server/reports/rendering/html";
import { createPostgresWeeklyReportGenerator } from "@/server/reports/store";
import { createSite, createTrackedQuery, SitesStoreError } from "@/server/sites/store";
import type { PrivateObjectStorage, PutPrivateObjectInput, SignedObjectUrl } from "@/server/storage/s3";
import { CollectionOutboxRelayRuntime } from "@/worker/relay-runtime";
import { WorkerRuntime } from "@/worker/runtime";
import { PostgresWeeklyCollectionScheduler, PostgresWeeklyReportScheduler } from "@/worker/scheduler";

const url = process.env.PG16_TEST_DATABASE_URL!;
if (!url) throw new Error("PG16_TEST_DATABASE_URL required");
const owner = new Pool({ connectionString: url, max: 4, ssl: false });
const scheduler = new Pool({ connectionString: url, max: 4, ssl: false, options: "-c role=semforge_scheduler" });
const dispatcher = new Pool({ connectionString: url, max: 4, ssl: false, options: "-c role=semforge_dispatcher" });
const worker = new Pool({ connectionString: url, max: 8, ssl: false, options: "-c role=semforge_worker" });

class MemoryStorage implements PrivateObjectStorage {
  readonly objects = new Map<string, Uint8Array>();
  async putPrivate(input: PutPrivateObjectInput) {
    const existing = this.objects.get(input.key);
    if (!existing) this.objects.set(input.key, input.body);
    const body = existing ?? input.body;
    return { created: !existing, checksumSha256: createHash("sha256").update(body).digest("hex"), sizeBytes: body.byteLength, contentIdentitySha256: input.contentIdentitySha256 };
  }
  async getPrivate(key: string) { return this.objects.get(key)!; }
  async createSignedGetUrl(): Promise<SignedObjectUrl> { throw new Error("not used"); }
}

const workspaceIds: string[] = [];
const siteIds: string[] = [];
const siteWorkspace = new Map<string, string>();
const metrics: Record<string, unknown> = {};

async function main() {
  for (let w = 1; w <= 3; w += 1) {
    const workspaceId = `a1000000-0000-4000-8000-${w.toString().padStart(12, "0")}`;
    const customerId = `a1100000-0000-4000-8000-${w.toString().padStart(12, "0")}`;
    workspaceIds.push(workspaceId);
    await owner.query("insert into workspaces (id, name, slug) values ($1, $2, $3)", [workspaceId, `QA Agency ${w}`, `qa-agency-${w}`]);
    await owner.query("insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, $3)", [customerId, workspaceId, `qa-customer-${w}`]);
    await owner.query("insert into subscriptions (workspace_id, billing_customer_id, status) values ($1, $2, 'active')", [workspaceId, customerId]);
    for (let s = 1; s <= 3; s += 1) {
      const key = `${w}-${s}`;
      const site = await createSite(owner, { workspaceId, actorUserId: null, name: `Site ${key}`, domain: `site-${key}.example.com` }, { requestId: `site-${key}`, idempotencyKey: `site-${key}`, resolveDomainAddresses: async () => ["8.8.8.8"] });
      const replay = await createSite(owner, { workspaceId, actorUserId: null, name: `Site ${key}`, domain: `site-${key}.example.com` }, { requestId: `site-${key}`, idempotencyKey: `site-${key}`, resolveDomainAddresses: async () => ["8.8.8.8"] });
      assert.equal(replay.id, site.id);
      siteIds.push(site.id);
      siteWorkspace.set(site.id, workspaceId);
      for (const type of ["rank", "aio"] as const) {
        for (let q = 1; q <= 20; q += 1) {
          const created = await createTrackedQuery(owner, { workspaceId, siteId: site.id, type, query: `${type} query ${key}-${q}` }, { requestId: `q-${key}-${type}-${q}`, idempotencyKey: `q-${key}-${type}-${q}` });
          if (q === 1) {
            const replayQuery = await createTrackedQuery(owner, { workspaceId, siteId: site.id, type, query: `${type} query ${key}-${q}` }, { requestId: `q-${key}-${type}-${q}`, idempotencyKey: `q-${key}-${type}-${q}` });
            assert.equal(replayQuery.id, created.id);
          }
        }
        await assert.rejects(createTrackedQuery(owner, { workspaceId, siteId: site.id, type, query: `${type} overflow ${key}` }, { requestId: `overflow-${key}-${type}`, idempotencyKey: `overflow-${key}-${type}` }), (error) => error instanceof SitesStoreError && error.code === "TRACKING_LIMIT");
      }
    }
    await assert.rejects(createSite(owner, { workspaceId, actorUserId: null, name: "Overflow", domain: `overflow-${w}.example.com` }, { requestId: `overflow-${w}`, idempotencyKey: `overflow-${w}`, resolveDomainAddresses: async () => ["8.8.8.8"] }), (error) => error instanceof SitesStoreError && error.code === "SITE_LIMIT");
  }

  metrics.workspaces = workspaceIds.length;
  metrics.sites = siteIds.length;
  metrics.trackedQueries = Number((await owner.query<{ count: number }>("select count(*)::int count from tracked_queries where workspace_id = any($1::uuid[])", [workspaceIds])).rows[0]!.count);
  assert.equal(metrics.trackedQueries, 360);
  metrics.initialOutbox = Number((await owner.query<{ count: number }>("select count(*)::int count from outbox where workspace_id = any($1::uuid[]) and topic in ('site.created','tracking.created')", [workspaceIds])).rows[0]!.count);
  assert.equal(metrics.initialOutbox, 369);

  const collectionAt = new Date("2026-08-16T09:00:00.000Z");
  const collection = await new PostgresWeeklyCollectionScheduler(scheduler).schedule({ executedAt: collectionAt });
  const collectionReplay = await new PostgresWeeklyCollectionScheduler(scheduler).schedule({ executedAt: collectionAt });
  assert.deepEqual(collection, { google: 9, naver: 180, gsc: 0 });
  assert.deepEqual(collectionReplay, { google: 0, naver: 0, gsc: 0 });
  metrics.collection = collection;

  let relayNow = new Date("2026-08-16T10:00:00.000Z");
  const relay = new CollectionOutboxRelayRuntime({ database: dispatcher, relayId: "nine-site-relay", batchSize: 100, clock: () => relayNow });
  const collectionRelayRuns = [await relay.runOnce(), await relay.runOnce()];
  const relayedCollection = collectionRelayRuns.reduce((total, run) => ({ claimed: total.claimed + run.claimed, published: total.published + run.published, failed: total.failed + run.failed }), { claimed: 0, published: 0, failed: 0 });
  assert.deepEqual(relayedCollection, { claimed: 189, published: 189, failed: 0 });
  metrics.collectionRelay = { ...relayedCollection, batches: collectionRelayRuns.length };

  let googleCalls = 0;
  let naverCalls = 0;
  const collectionWorker = new WorkerRuntime({
    database: dispatcher,
    tenantDatabase: worker,
    workerId: "nine-site-collector",
    concurrency: 100,
    clock: () => new Date("2026-08-16T10:30:00.000Z"),
    handlers: {
      "collect.google": defineJobHandler(async () => { googleCalls += 1; return jobSucceeded({ boundary: "talordata-contract-mock" }); }),
      "collect.naver": defineJobHandler(async () => { naverCalls += 1; return jobSucceeded({ boundary: "naver-contract-mock" }); }),
    },
  });
  const collectionRuns = [];
  while (googleCalls + naverCalls < 189) collectionRuns.push(await collectionWorker.runOnce());
  assert.equal(googleCalls, 9);
  assert.equal(naverCalls, 180);
  metrics.collectorMocks = { googleCalls, naverCalls, runBatches: collectionRuns.length };

  const reportAt = new Date("2026-08-16T23:00:00.000Z");
  const reports = await new PostgresWeeklyReportScheduler(scheduler).schedule({ executedAt: reportAt });
  const reportReplay = await new PostgresWeeklyReportScheduler(scheduler).schedule({ executedAt: new Date("2026-08-17T00:00:00.000Z") });
  assert.deepEqual(reports, { cycleMonday: "2026-08-17", reports: 9 });
  assert.equal(reportReplay.reports, 0);
  metrics.reportScheduler = reports;
  relayNow = new Date("2026-08-17T00:01:00.000Z");
  assert.deepEqual(await relay.runOnce(), { claimed: 9, published: 9, failed: 0 });

  const reportHandler = createReportGenerationJobHandler(createPostgresWeeklyReportGenerator(worker, { loadOwnerRecipients: async (workspaceId) => [`owner+${workspaceId.slice(-1)}@example.test`] }));
  const reportWorker = new WorkerRuntime({ database: dispatcher, tenantDatabase: worker, workerId: "nine-site-reports", concurrency: 9, clock: () => new Date("2026-08-17T00:05:00.000Z"), handlers: { "report.snapshot": reportHandler } });
  assert.deepEqual(await reportWorker.runOnce(), { claimed: 9, succeeded: 9, retryable: 0, dead: 0, leaseLost: 0 });
  metrics.weeklyReports = Number((await owner.query<{ count: number }>("select count(*)::int count from weekly_reports where workspace_id = any($1::uuid[])", [workspaceIds])).rows[0]!.count);
  assert.equal(metrics.weeklyReports, 9);

  const reportOutboxRelay = await relay.runOnce();
  assert.deepEqual(reportOutboxRelay, { claimed: 18, published: 18, failed: 0 });
  metrics.reportDeliveryRelay = reportOutboxRelay;

  const storage = new MemoryStorage();
  const accepted = new Set<string>();
  const emailCalls: ReportEmailSendInput[] = [];
  let crashOnce = true;
  const renderer: ReportPdfRenderer = { async render(snapshot) { const hash = snapshotSha256(snapshot); return { pdf: new TextEncoder().encode(`%PDF-1.7\n${hash}\n%%EOF`), html: `<html data-snapshot-sha256="${hash}"></html>`, snapshotSha256: hash }; } };
  const service = createReportDeliveryService({
    store: new PostgresReportDeliveryStore(worker), storage, renderer, appPublicUrl: "https://app.semforge.example",
    email: { async send(input) { emailCalls.push(input); accepted.add(input.idempotencyKey); if (crashOnce) { crashOnce = false; throw new Error("accepted then connection reset"); } return { providerMessageId: `mock-${input.idempotencyKey}` }; } },
    clock: () => new Date("2026-08-17T00:10:00.000Z"),
  });
  const { createReportPdfRenderJobHandler, createReportEmailDeliveryJobHandler } = await import("@/server/reports/delivery/job-handler");
  let deliveryNow = new Date("2026-08-17T00:10:00.000Z");
  const deliveryWorker = new WorkerRuntime({ database: dispatcher, tenantDatabase: worker, workerId: "nine-site-delivery", concurrency: 18, retryBackoffMs: 1, maxRetryBackoffMs: 1, clock: () => deliveryNow, handlers: { "report.pdf.render": createReportPdfRenderJobHandler(service), "report.email.deliver": createReportEmailDeliveryJobHandler(service) } });
  const firstDelivery = await deliveryWorker.runOnce();
  assert.equal(firstDelivery.claimed, 18);
  assert.equal(firstDelivery.retryable, 1);
  deliveryNow = new Date("2026-08-17T00:10:01.000Z");
  const retryDelivery = await deliveryWorker.runOnce();
  assert.deepEqual(retryDelivery, { claimed: 1, succeeded: 1, retryable: 0, dead: 0, leaseLost: 0 });
  assert.equal(storage.objects.size, 9);
  assert.equal(accepted.size, 9);
  assert.equal(emailCalls.length, 10);
  const deliveryRows = await owner.query<{ deliveries: number; assets: number; delivered: number }>(`select (select count(*)::int from deliveries where workspace_id = any($1::uuid[])) deliveries, (select count(*)::int from report_assets where workspace_id = any($1::uuid[])) assets, (select count(*)::int from deliveries where workspace_id = any($1::uuid[]) and status='delivered') delivered`, [workspaceIds]);
  assert.deepEqual(deliveryRows.rows[0], { deliveries: 9, assets: 9, delivered: 9 });
  metrics.delivery = { ...deliveryRows.rows[0], emailCalls: emailCalls.length, acceptedIdempotencyKeys: accepted.size, objectCount: storage.objects.size, retryableAfterAcceptedCrash: firstDelivery.retryable };

  const killWorkspace = workspaceIds[0]!;
  const killJob = await owner.query<{ id: string }>(`insert into jobs (workspace_id,type,payload,idempotency_key,available_at) values ($1,'qa.kill','{}','qa-kill','2026-08-17T00:20:00.000Z') returning id::text`, [killWorkspace]);
  const crashed = await dispatcher.connect();
  await crashed.query("begin");
  const { PostgresJobQueue } = await import("@/server/jobs/queue");
  const leased = (await new PostgresJobQueue(crashed).claim({ workerId: "killed-worker", limit: 1, leaseMs: 1000, now: new Date("2026-08-17T00:20:00.000Z") }))[0]!;
  assert.equal(leased.id, killJob.rows[0]!.id);
  await crashed.query("commit");
  crashed.release();
  let recoveredCalls = 0;
  const faultWorker = new WorkerRuntime({ database: dispatcher, tenantDatabase: worker, workerId: "recovery-worker", concurrency: 1, clock: () => new Date("2026-08-17T00:20:02.000Z"), handlers: { "qa.kill": defineJobHandler(async () => { recoveredCalls += 1; return jobSucceeded({ recovered: true }); }) } });
  assert.deepEqual(await faultWorker.runOnce(), { claimed: 1, succeeded: 1, retryable: 0, dead: 0, leaseLost: 0 });
  const recoveredState = await owner.query<{ status: string; attempts: number }>("select status, attempts from jobs where id=$1", [leased.id]);
  assert.deepEqual(recoveredState.rows[0], { status: "succeeded", attempts: 2 });
  assert.equal(recoveredCalls, 1);
  metrics.faultRecovery = { status: "succeeded", attempts: 2, handlerCallsAfterKill: recoveredCalls };

  console.log(JSON.stringify(metrics, null, 2));
}

main().finally(async () => Promise.all([owner.end(), scheduler.end(), dispatcher.end(), worker.end()]));
