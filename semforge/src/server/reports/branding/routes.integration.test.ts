// @TASK P4-B1 - Tenant-scoped report branding API contract
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/server/reports/branding/routes.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { AuthMembershipRole } from "@/server/auth/contracts";
import type { BillingAccessAuthorizer } from "@/server/billing/access";
import {
  WorkspacePrivacyOperationBlockedError,
  type WorkspacePrivacyOperationGuard,
} from "@/server/privacy/operation";
import { createReportBrandingRouteHandlers } from "@/server/reports/branding/routes";
import { createReportsRouteHandlers } from "@/server/reports/routes";
import { generateWeeklyReport } from "@/server/reports/store";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
const workspaceId = "35000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "35000000-0000-4000-8000-000000000002";
const siteId = "35000000-0000-4000-8000-000000000011";
const userId = "35000000-0000-4000-8000-000000000101";

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

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
  await pg.query(
    `insert into workspaces (id, name, slug, logo_url, accent_color) values
       ($1, 'Original Agency', 'branding-owner', 'https://cdn.example.com/original.png', '#123456'),
       ($2, 'Other Agency', 'branding-other', null, '#654321')`,
    [workspaceId, otherWorkspaceId],
  );
  await pg.query(
    "insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Brand Site', 'brand.example.com')",
    [siteId, workspaceId],
  );
});

after(async () => pg.close());

function handlers(
  role: AuthMembershipRole,
  workspace = workspaceId,
  privacyOperation: WorkspacePrivacyOperationGuard = allowPrivacyOperation,
) {
  return createReportBrandingRouteHandlers({
    db: pg,
    authorizeBilling: allowBillingAccess,
    privacyOperation,
    resolveSession: async () => ({
      workspaceId: workspace,
      userId,
      role,
      requestId: `branding-${role}`,
    }),
    resolveLogoAddresses: async () => ["8.8.8.8"],
  });
}

async function body(response: Response) {
  return response.json() as Promise<{
    data: { name: string; logoUrl: string | null; accentColor: string } | null;
    error: { code: string; fields?: Record<string, string> } | null;
  }>;
}

function patchRequest(value: unknown, origin = "https://app.semforge.test") {
  return new Request("https://app.semforge.test/api/v1/reports/branding", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(value),
  });
}

test("member는 브랜딩을 읽을 수 있지만 쓰지 못하고 owner/admin만 same-origin PATCH할 수 있다", async () => {
  const member = handlers("member");
  const read = await member.branding.GET(
    new Request("https://app.semforge.test/api/v1/reports/branding"),
    undefined,
  );
  assert.equal(read.status, 200);
  assert.deepEqual((await body(read)).data, {
    name: "Original Agency",
    logoUrl: "https://cdn.example.com/original.png",
    accentColor: "#123456",
  });

  const forbidden = await member.branding.PATCH(
    patchRequest({ name: "Member Edit", logoUrl: null, accentColor: "#111111" }),
    undefined,
  );
  assert.equal(forbidden.status, 403);

  const crossOrigin = await handlers("owner").branding.PATCH(
    patchRequest(
      { name: "Cross Origin", logoUrl: null, accentColor: "#222222" },
      "https://attacker.example",
    ),
    undefined,
  );
  assert.equal(crossOrigin.status, 403);

  const admin = await handlers("admin").branding.PATCH(
    patchRequest({ name: "Admin Agency", logoUrl: null, accentColor: "#abcdef" }),
    undefined,
  );
  assert.equal(admin.status, 200);
  assert.deepEqual((await body(admin)).data, {
    name: "Admin Agency",
    logoUrl: null,
    accentColor: "#ABCDEF",
  });
});

test("account_created는 브랜딩 GET/PATCH 직접 API 우회를 403으로 차단한다", async () => {
  const capabilities: string[] = [];
  const blocked = createReportBrandingRouteHandlers({
    db: pg,
    authorizeBilling: async ({ capability }) => {
      capabilities.push(capability);
      return {
        allowed: false,
        mode: "billing_only",
        reason: "payment_required",
        reportPeriodEndBefore: null,
      };
    },
    resolveSession: async () => ({
      workspaceId,
      userId,
      role: "owner",
      requestId: "branding-account-created",
    }),
    resolveLogoAddresses: async () => ["8.8.8.8"],
    privacyOperation: allowPrivacyOperation,
  });

  const read = await blocked.branding.GET(
    new Request("https://app.semforge.test/api/v1/reports/branding"),
    undefined,
  );
  const write = await blocked.branding.PATCH(
    patchRequest({ name: "Blocked", logoUrl: null, accentColor: "#123456" }),
    undefined,
  );
  assert.equal(read.status, 403);
  assert.equal((await body(read)).error?.code, "FORBIDDEN");
  assert.equal(write.status, 403);
  assert.equal((await body(write)).error?.code, "FORBIDDEN");
  assert.deepEqual(capabilities, ["workspace:read", "workspace:write"]);
});

test("blocking/erased workspace는 브랜딩 GET을 유지하고 PATCH 저장을 409로 차단한다", async () => {
  for (const state of ["blocking", "erased"] as const) {
    const before = (
      await pg.query<{
        name: string;
        logo_url: string | null;
        accent_color: string;
        outbox_count: number;
      }>(
        `select name, logo_url, accent_color,
                (select count(*)::int from outbox where workspace_id = $1) outbox_count
           from workspaces where id = $1`,
        [workspaceId],
      )
    ).rows[0]!;
    const privacyOperation: WorkspacePrivacyOperationGuard = {
      async withShared() {
        throw new WorkspacePrivacyOperationBlockedError(state);
      },
    };
    const owner = handlers("owner", workspaceId, privacyOperation);
    const read = await owner.branding.GET(
      new Request("https://app.semforge.test/api/v1/reports/branding"),
      undefined,
    );
    const write = await owner.branding.PATCH(
      patchRequest({
        name: `${state} must not persist`,
        logoUrl: null,
        accentColor: "#010203",
      }),
      undefined,
    );
    assert.equal(read.status, 200);
    assert.equal(write.status, 409);
    assert.equal((await body(write)).error?.code, "CONFLICT");

    const afterState = (
      await pg.query<typeof before>(
        `select name, logo_url, accent_color,
                (select count(*)::int from outbox where workspace_id = $1) outbox_count
           from workspaces where id = $1`,
        [workspaceId],
      )
    ).rows[0]!;
    assert.deepEqual(afterState, before);
  }
});

test("브랜딩 PATCH는 tenant override, 길이/색상, 위험 URL과 private DNS를 거부한다", async () => {
  const owner = handlers("owner");
  const invalidBodies = [
    { name: "", logoUrl: null, accentColor: "#123456" },
    { name: "x".repeat(81), logoUrl: null, accentColor: "#123456" },
    { name: "Agency", logoUrl: null, accentColor: "red" },
    { name: "Agency", logoUrl: "javascript:alert(1)", accentColor: "#123456" },
    { name: "Agency", logoUrl: "http://cdn.example.com/logo.png", accentColor: "#123456" },
    { name: "Agency", logoUrl: "https://127.0.0.1/logo.png", accentColor: "#123456" },
    { name: "Agency", logoUrl: "https://metadata.google.internal/logo.png", accentColor: "#123456" },
    { name: "Agency", logoUrl: "https://user:pass@cdn.example.com/logo.png", accentColor: "#123456" },
    { name: "Agency", logoUrl: "https://cdn.example.com:8443/logo.png", accentColor: "#123456" },
    { name: "Agency", logoUrl: null, accentColor: "#123456", workspaceId: otherWorkspaceId },
  ];
  for (const value of invalidBodies) {
    const response = await owner.branding.PATCH(patchRequest(value), undefined);
    assert.equal(response.status, 422, JSON.stringify(value));
  }

  const privateDnsHandlers = createReportBrandingRouteHandlers({
    db: pg,
    authorizeBilling: allowBillingAccess,
    resolveSession: async () => ({
      workspaceId,
      userId,
      role: "owner",
      requestId: "branding-private-dns",
    }),
    resolveLogoAddresses: async () => ["169.254.169.254"],
    privacyOperation: allowPrivacyOperation,
  });
  const privateDns = await privateDnsHandlers.branding.PATCH(
    patchRequest({
      name: "Agency",
      logoUrl: "https://cdn.example.com/logo.png",
      accentColor: "#123456",
    }),
    undefined,
  );
  assert.equal(privateDns.status, 422);
  assert.equal((await body(privateDns)).error?.fields?.logoUrl.length === 0, false);
});

test("브랜딩 변경은 현재 workspace에만 반영되고 이미 생성된 report snapshot은 불변이다", async () => {
  const snapshot = await generateWeeklyReport(pg, {
    workspaceId,
    siteId,
    cycleMonday: "2026-08-10",
  });
  const response = await handlers("owner").branding.PATCH(
    patchRequest({
      name: "  New   Agency  ",
      logoUrl: "https://cdn.example.com/new-logo.svg",
      accentColor: "#0f675f",
    }),
    undefined,
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await body(response)).data, {
    name: "New Agency",
    logoUrl: "https://cdn.example.com/new-logo.svg",
    accentColor: "#0F675F",
  });

  const otherRead = await handlers("member", otherWorkspaceId).branding.GET(
    new Request("https://app.semforge.test/api/v1/reports/branding"),
    undefined,
  );
  assert.deepEqual((await body(otherRead)).data, {
    name: "Other Agency",
    logoUrl: null,
    accentColor: "#654321",
  });

  const reports = createReportsRouteHandlers({
    db: pg,
    authorizeBilling: allowBillingAccess,
    resolveSession: async () => ({
      workspaceId,
      userId,
      role: "member",
      requestId: "branding-snapshot-read",
    }),
  });
  const oldReport = await reports.reportById.GET(
    new Request(`https://app.semforge.test/api/v1/reports/${snapshot.id}`),
    { params: Promise.resolve({ reportId: snapshot.id }) },
  );
  const oldData = (await oldReport.json()) as {
    data: { brand: { name: string; logoUrl: string | null; accentColor: string } };
  };
  assert.deepEqual(oldData.data.brand, snapshot.brand);
});
