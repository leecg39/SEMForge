// @TASK P4-R1-T1 - Crash-safe idempotent report delivery contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterEach, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import {
  createReportDeliveryService,
  type ReportEmailSendInput,
  ReportEmailSenderError,
} from "@/server/reports/delivery/service";
import { PostgresReportDeliveryStore } from "@/server/reports/delivery/store";
import type { ReportDeliveryStore } from "@/server/reports/delivery/store";
import { snapshotSha256 } from "@/server/reports/rendering/html";
import type { ReportPdfRenderer } from "@/server/reports/rendering/pdf";
import type {
  PrivateObjectStorage,
  PutPrivateObjectInput,
  SignedObjectUrl,
} from "@/server/storage/s3";
import type { WeeklyReportSnapshot } from "@/server/reports/types";

const databases: PGlite[] = [];
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
const workspaceId = "57000000-0000-4000-8000-000000000001";
const siteId = "57000000-0000-4000-8000-000000000002";
const reportId = "57000000-0000-4000-8000-000000000003";

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function snapshot(): WeeklyReportSnapshot {
  const unavailable = (key: "aio" | "naver" | "gsc") => ({
    key,
    available: false as const,
    unavailableReason: "provider_data_missing",
    capturedAt: "2026-08-09T23:00:00.000Z",
    data: {},
  });
  return {
    version: 1,
    capturedAt: "2026-08-09T23:00:00.000Z",
    schedule: {
      timezone: "Asia/Seoul",
      collectionAt: "2026-08-09T09:00:00.000Z",
      retryCutoffAt: "2026-08-09T22:00:00.000Z",
      snapshotAt: "2026-08-09T23:00:00.000Z",
    },
    period: {
      timezone: "America/Los_Angeles",
      current: { start: "2026-07-31", end: "2026-08-06" },
      comparison: { start: "2026-07-24", end: "2026-07-30" },
    },
    brand: { name: "서울 검색 연구소", logoUrl: null, accentColor: "#123456" },
    sections: {
      rank: {
        key: "rank",
        available: true,
        unavailableReason: null,
        capturedAt: "2026-08-09T09:30:00.000Z",
        data: { observations: [{ query: "주간 SEO", position: 2 }] },
      },
      aio: unavailable("aio"),
      naver: unavailable("naver"),
      gsc: unavailable("gsc"),
    },
  };
}

async function databaseWithReport(): Promise<PGlite> {
  const database = new PGlite();
  databases.push(database);
  await database.waitReady;
  await migrate(drizzle(database), { migrationsFolder });
  await database.query("insert into workspaces (id, name, slug) values ($1, '서울 검색 연구소', 'delivery-test')", [workspaceId]);
  await database.query("insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Example', 'example.test')", [siteId, workspaceId]);
  const value = snapshot();
  await database.query(
    `insert into weekly_reports
      (id, workspace_id, site_id, status, period_start, period_end, comparison_start,
       comparison_end, snapshot, brand_name, logo_url, accent_color, snapshot_ready_at)
     values ($1, $2, $3, 'partial', '2026-07-31', '2026-08-06', '2026-07-24',
       '2026-07-30', $4::jsonb, $5, null, '#155eef', $6)`,
    [reportId, workspaceId, siteId, JSON.stringify(value), value.brand.name, value.capturedAt],
  );
  return database;
}

class MemoryStorage implements PrivateObjectStorage {
  readonly objects = new Map<string, { body: Uint8Array; identity?: string }>();

  async putPrivate(input: PutPrivateObjectInput) {
    const existing = this.objects.get(input.key);
    if (!existing) this.objects.set(input.key, { body: input.body, identity: input.contentIdentitySha256 });
    const object = existing ?? { body: input.body, identity: input.contentIdentitySha256 };
    return {
      created: !existing,
      checksumSha256: createHash("sha256").update(object.body).digest("hex"),
      sizeBytes: object.body.byteLength,
      contentIdentitySha256: object.identity,
    };
  }

  async getPrivate(key: string) {
    const object = this.objects.get(key);
    if (!object) throw new Error("NOT_FOUND");
    return object.body;
  }

  async createSignedGetUrl(): Promise<SignedObjectUrl> {
    throw new Error("not used");
  }
}

test("Resend 수락 직후 crash가 나도 retry/duplicate는 같은 snapshot과 idempotency key로 이메일 1건만 만든다", async () => {
  const database = await databaseWithReport();
  const store = new PostgresReportDeliveryStore(database);
  const storage = new MemoryStorage();
  const pdfHashes: string[] = [];
  const renderer: ReportPdfRenderer = {
    async render(value) {
      const hash = snapshotSha256(value);
      pdfHashes.push(hash);
      return {
        pdf: new TextEncoder().encode(`%PDF-1.7\n${hash}\n%%EOF`),
        html: `<html data-snapshot-sha256="${hash}"></html>`,
        snapshotSha256: hash,
      };
    },
  };
  const providerAccepted = new Set<string>();
  const sendCalls: ReportEmailSendInput[] = [];
  let crashOnce = true;
  const service = createReportDeliveryService({
    store,
    storage,
    renderer,
    appPublicUrl: "https://app.semforge.example",
    email: {
      async send(input) {
        sendCalls.push(input);
        providerAccepted.add(input.idempotencyKey);
        if (crashOnce) {
          crashOnce = false;
          throw new Error("connection reset after provider accepted api_key=secret customer@example.test");
        }
        return { providerMessageId: "resend-message-1" };
      },
    },
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
  });
  const input = { workspaceId, reportId, recipient: "Customer@Example.test" };

  await assert.rejects(service.deliverEmail(input), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "REPORT_EMAIL_PROVIDER_ERROR");
    assert.doesNotMatch(error.message, /secret|customer@/i);
    return true;
  });
  const recovered = await service.deliverEmail(input);
  const duplicate = await service.deliverEmail(input);

  assert.equal(recovered.status, "delivered");
  assert.equal(duplicate.status, "already_delivered");
  assert.equal(providerAccepted.size, 1);
  assert.equal(sendCalls.length, 2);
  assert.equal(new Set(sendCalls.map((call) => call.idempotencyKey)).size, 1);
  assert.equal(new Set(sendCalls.map((call) => call.snapshotSha256)).size, 1);
  assert.equal(sendCalls[0]!.snapshotSha256, snapshotSha256(snapshot()));
  assert.match(sendCalls[0]!.html, new RegExp(sendCalls[0]!.snapshotSha256));
  assert.match(sendCalls[0]!.html, /#123456/);
  assert.match(Buffer.from(sendCalls[0]!.attachment.content).toString(), /%PDF-1\.7/);
  assert.deepEqual(pdfHashes, [snapshotSha256(snapshot())]);

  const state = await database.query<{
    status: string;
    attempts: number;
    last_error: string | null;
    recipient: string;
    delivery_count: number;
    asset_count: number;
    report_status: string;
  }>(
    `select delivery.status, delivery.attempts, delivery.last_error, delivery.recipient,
       (select count(*)::int from deliveries where workspace_id = $1) delivery_count,
       (select count(*)::int from report_assets where workspace_id = $1) asset_count,
       (select status from weekly_reports where id = $2) report_status
     from deliveries delivery where delivery.workspace_id = $1`,
    [workspaceId, reportId],
  );
  assert.deepEqual(state.rows, [{
    status: "delivered",
    attempts: 2,
    last_error: null,
    recipient: "customer@example.test",
    delivery_count: 1,
    asset_count: 1,
    report_status: "delivered",
  }]);
});

test("PDF access store는 snapshot client period와 별도로 실제 weekly_reports.period_end를 반환한다", async () => {
  const database = await databaseWithReport();
  const store = new PostgresReportDeliveryStore(database);
  const report = await store.loadReportForAccess({ workspaceId, reportId });

  assert.equal(report.periodEnd, "2026-08-06");
  assert.equal(report.snapshot.period.current.end, "2026-08-06");
});

test("provider가 idempotency payload를 거부하면 terminal 상태를 보존한다", async () => {
  const database = await databaseWithReport();
  const service = createReportDeliveryService({
    store: new PostgresReportDeliveryStore(database),
    storage: new MemoryStorage(),
    renderer: {
      async render(value) {
        const hash = snapshotSha256(value);
        return {
          pdf: new TextEncoder().encode("%PDF-1.7 terminal"),
          html: `<html data-snapshot-sha256="${hash}"></html>`,
          snapshotSha256: hash,
        };
      },
    },
    email: {
      async send() {
        throw new ReportEmailSenderError("rejected");
      },
    },
    appPublicUrl: "https://app.semforge.example",
  });

  await assert.rejects(
    service.deliverEmail({ workspaceId, reportId, recipient: "customer@example.test" }),
    /REPORT_EMAIL_PROVIDER_REJECTED/,
  );
  const state = await database.query<{ status: string; last_error: string }>(
    "select status, last_error from deliveries where workspace_id = $1",
    [workspaceId],
  );
  assert.deepEqual(state.rows, [{
    status: "failed",
    last_error: "REPORT_EMAIL_PROVIDER_REJECTED",
  }]);
});

test("Resend 24시간 멱등 보장 창이 끝난 in-doubt delivery는 재발송해 중복을 만들지 않는다", async () => {
  const database = await databaseWithReport();
  const storage = new MemoryStorage();
  let now = new Date("2026-08-12T01:00:00.000Z");
  let sends = 0;
  const service = createReportDeliveryService({
    store: new PostgresReportDeliveryStore(database),
    storage,
    renderer: {
      async render(value) {
        const hash = snapshotSha256(value);
        return {
          pdf: new TextEncoder().encode(`%PDF-1.7\n${hash}`),
          html: `<html data-snapshot-sha256="${hash}"></html>`,
          snapshotSha256: hash,
        };
      },
    },
    appPublicUrl: "https://app.semforge.example",
    email: {
      async send() {
        sends += 1;
        throw new Error("accepted but response lost");
      },
    },
    clock: () => now,
  });
  const input = { workspaceId, reportId, recipient: "customer@example.test" };

  await assert.rejects(service.deliverEmail(input), /REPORT_EMAIL_PROVIDER_ERROR/);
  now = new Date("2026-08-13T00:01:00.001Z");
  await assert.rejects(service.deliverEmail(input), /REPORT_EMAIL_IDEMPOTENCY_EXPIRED/);
  assert.equal(sends, 1);

  const state = await database.query<{ attempts: number; last_error: string }>(
    "select attempts, last_error from deliveries where workspace_id = $1",
    [workspaceId],
  );
  assert.deepEqual(state.rows, [{
    attempts: 2,
    last_error: "REPORT_EMAIL_IDEMPOTENCY_EXPIRED",
  }]);
});

test("object PUT 성공 뒤 DB crash가 나도 immutable snapshot identity로 기존 PDF를 복구한다", async () => {
  const database = await databaseWithReport();
  const baseStore = new PostgresReportDeliveryStore(database);
  let crashOnce = true;
  const store: ReportDeliveryStore = {
    loadReportSnapshot: (input) => baseStore.loadReportSnapshot(input),
    prepareEmail: (input) => baseStore.prepareEmail(input),
    markEmailDelivered: (input) => baseStore.markEmailDelivered(input),
    markEmailFailed: (input) => baseStore.markEmailFailed(input),
    findPdfAsset: (input) => baseStore.findPdfAsset(input),
    async savePdfAsset(input) {
      if (crashOnce) {
        crashOnce = false;
        throw new Error("database connection lost after object PUT");
      }
      return baseStore.savePdfAsset(input);
    },
  };
  const storage = new MemoryStorage();
  let renders = 0;
  const service = createReportDeliveryService({
    store,
    storage,
    renderer: {
      async render(value) {
        renders += 1;
        const hash = snapshotSha256(value);
        return {
          pdf: new TextEncoder().encode(`%PDF-1.7\n${hash}\nrender-${renders}`),
          html: `<html data-snapshot-sha256="${hash}"></html>`,
          snapshotSha256: hash,
        };
      },
    },
    email: { async send() { throw new Error("not used"); } },
    appPublicUrl: "https://app.semforge.example",
  });

  await assert.rejects(service.renderPdf({ workspaceId, reportId }), /database connection lost/);
  const recovered = await service.renderPdf({ workspaceId, reportId });

  assert.equal(renders, 2);
  assert.equal(storage.objects.size, 1);
  const object = [...storage.objects.values()][0]!;
  assert.match(Buffer.from(object.body).toString(), /render-1$/);
  assert.equal(recovered.asset.checksumSha256, createHash("sha256").update(object.body).digest("hex"));
  assert.equal(recovered.snapshotSha256, object.identity);
});
