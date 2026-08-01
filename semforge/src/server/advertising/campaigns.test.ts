import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "advertising-campaigns-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

let db: (typeof import("@/db/client"))["db"];
let schema: typeof import("@/db/schema");
let service: typeof import("@/server/advertising/campaigns");
let exportService: typeof import("@/server/advertising/export");

const ownerAuth = {
  userId: "usr_owner",
  email: "owner@example.com",
  name: "Owner",
  workspaceId: "wsp_primary",
  workspaceName: "Primary",
  workspacePlan: "guru" as const,
  role: "owner" as const,
  sessionId: "test-session",
  ip: null,
  userAgent: "node-test",
};

const input = {
  requestId: "campaign-request-001",
  name: "통합 테스트 광고",
  domain: "example.com",
  platform: "google" as const,
  goal: "sales" as const,
  countryCode: "KR",
  languageCode: "ko",
  dailyBudgetCents: 30000,
  currencyCode: "KRW",
  adGroupName: "핵심 그룹",
  finalUrl: "https://example.com/product",
  keywords: [
    { keyword: "광고 도구", matchType: "phrase" as const, negative: false, source: "manual" as const },
  ],
  creative: {
    headlines: ["광고 도구", "초안 검토", "SEMForge"],
    descriptions: ["검토 가능한 광고 초안입니다.", "게시 전 안전하게 내보내세요."],
    path1: "광고",
    path2: "도구",
    finalUrl: "https://example.com/product",
  },
};

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("foreign_keys = OFF");
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.close();

  ({ db } = await import("@/db/client"));
  schema = await import("@/db/schema");
  service = await import("@/server/advertising/campaigns");
  exportService = await import("@/server/advertising/export");

  await db.insert(schema.workspaces).values([
    { id: ownerAuth.workspaceId, name: ownerAuth.workspaceName, slug: "primary", plan: "guru" },
    { id: "wsp_other", name: "Other", slug: "other", plan: "pro" },
  ]);
  await db.insert(schema.users).values([
    { id: ownerAuth.userId, email: ownerAuth.email, name: ownerAuth.name, passwordHash: "x", passwordSalt: "x" },
    { id: "usr_viewer", email: "viewer@example.com", name: "Viewer", passwordHash: "x", passwordSalt: "x" },
  ]);
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

test("캠페인 CRUD는 중복 제출과 낙관적 잠금을 처리한다", async () => {
  const created = await service.createAdvertisingCampaign(ownerAuth, input);
  assert.equal(created.reused, false);
  assert.equal(created.campaign.version, 1);
  assert.equal(created.campaign.keywords[0]?.keyword, "광고 도구");

  const duplicate = await service.createAdvertisingCampaign(ownerAuth, input);
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.campaign.id, created.campaign.id);

  const updated = await service.updateAdvertisingCampaign(ownerAuth, created.campaign.id, {
    version: created.campaign.version,
    name: "수정된 광고",
    status: "ready",
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.status, "ready");

  await assert.rejects(
    () => service.updateAdvertisingCampaign(ownerAuth, created.campaign.id, { version: 1, name: "충돌" }),
    (error: unknown) => (error as { code?: string }).code === "VERSION_CONFLICT",
  );
});

test("viewer 변경과 다른 워크스페이스 접근을 차단한다", async () => {
  const campaign = (await service.listAdvertisingCampaigns(ownerAuth))[0]!;
  const viewerAuth = { ...ownerAuth, userId: "usr_viewer", email: "viewer@example.com", role: "viewer" as const };
  await assert.rejects(
    () => service.createAdvertisingCampaign(viewerAuth, { ...input, requestId: "viewer-request-001" }),
    (error: unknown) => (error as { code?: string }).code === "FORBIDDEN",
  );
  await assert.rejects(
    () => service.getAdvertisingCampaign({ ...ownerAuth, workspaceId: "wsp_other" }, campaign.id),
    (error: unknown) => (error as { code?: string }).code === "NOT_FOUND",
  );
  await assert.rejects(
    () => service.applyAllAdvertisingRecommendations(viewerAuth, campaign.id),
    (error: unknown) => (error as { code?: string }).code === "FORBIDDEN",
  );
});

test("AI 제안은 승인 전 대기하고 승인 시에만 캠페인에 적용된다", async () => {
  const campaign = (await service.listAdvertisingCampaigns(ownerAuth))[0]!;
  await db.insert(schema.advertisingRecommendations).values({
    id: "rec_apply_keyword",
    workspaceId: ownerAuth.workspaceId,
    campaignId: campaign.id,
    kind: "add_keyword",
    rationale: "검토 후 적용 테스트",
    beforeValue: "null",
    afterValue: JSON.stringify({ keyword: "AI 추천 키워드", matchType: "exact", negative: false }),
    source: "test",
    createdBy: ownerAuth.userId,
    updatedBy: ownerAuth.userId,
  });
  const before = await service.getAdvertisingCampaign(ownerAuth, campaign.id);
  assert.equal(before.keywords.some((item) => item.keyword === "AI 추천 키워드"), false);
  assert.equal(before.recommendations.find((item) => item.id === "rec_apply_keyword")?.status, "pending");

  const applied = await service.resolveAdvertisingRecommendation(
    ownerAuth,
    campaign.id,
    "rec_apply_keyword",
    "apply",
  );
  assert.equal(applied.keywords.find((item) => item.keyword === "AI 추천 키워드")?.source, "ai");
  assert.equal(applied.recommendations.find((item) => item.id === "rec_apply_keyword")?.status, "applied");
});

test("대기 중인 AI 제안을 하나의 캠페인 버전으로 전체 적용한다", async () => {
  const campaign = (await service.listAdvertisingCampaigns(ownerAuth))[0]!;
  await db.insert(schema.advertisingRecommendations).values([
    {
      id: "rec_apply_all_keyword",
      workspaceId: ownerAuth.workspaceId,
      campaignId: campaign.id,
      kind: "add_keyword",
      rationale: "전체 적용 키워드",
      beforeValue: "null",
      afterValue: JSON.stringify({ keyword: "전체 적용 키워드", matchType: "phrase", negative: false }),
      source: "test",
      createdBy: ownerAuth.userId,
      updatedBy: ownerAuth.userId,
    },
    {
      id: "rec_apply_all_budget",
      workspaceId: ownerAuth.workspaceId,
      campaignId: campaign.id,
      kind: "budget",
      rationale: "전체 적용 예산",
      beforeValue: JSON.stringify({ dailyBudgetCents: campaign.dailyBudgetCents }),
      afterValue: JSON.stringify({ dailyBudgetCents: 42_000 }),
      source: "test",
      createdBy: ownerAuth.userId,
      updatedBy: ownerAuth.userId,
    },
    {
      id: "rec_apply_all_malformed",
      workspaceId: ownerAuth.workspaceId,
      campaignId: campaign.id,
      kind: "add_keyword",
      rationale: "레거시 비정형 키워드 배열",
      beforeValue: "null",
      afterValue: JSON.stringify({ keywords: ["적용하면 안 되는 배열"] }),
      source: "test",
      createdBy: ownerAuth.userId,
      updatedBy: ownerAuth.userId,
    },
  ]);
  const before = await service.getAdvertisingCampaign(ownerAuth, campaign.id);
  const applied = await service.applyAllAdvertisingRecommendations(ownerAuth, campaign.id);

  assert.equal(applied.version, before.version + 1);
  assert.equal(applied.dailyBudgetCents, 42_000);
  assert.equal(applied.keywords.find((item) => item.keyword === "전체 적용 키워드")?.source, "ai");
  assert.equal(
    applied.recommendations.filter((item) =>
      item.id === "rec_apply_all_keyword" || item.id === "rec_apply_all_budget"
    ).every((item) => item.status === "applied"),
    true,
  );
  assert.equal(
    applied.recommendations.find((item) => item.id === "rec_apply_all_malformed")?.status,
    "rejected",
  );
  assert.equal(applied.keywords.some((item) => item.keyword === "적용하면 안 되는 배열"), false);
});

test("CSV와 JSON 내보내기는 결정적이며 KRW 예산 단위를 유지한다", async () => {
  const campaign = (await service.listAdvertisingCampaigns(ownerAuth))[0]!;
  const csv = exportService.advertisingCampaignCsv(campaign);
  const json = exportService.advertisingCampaignJson(campaign);
  assert.equal(csv, exportService.advertisingCampaignCsv(campaign));
  assert.equal(json, exportService.advertisingCampaignJson(campaign));
  assert.match(csv, /"42000"/);
  assert.match(json, /semforge\.advertising-draft\.v1/);
});
