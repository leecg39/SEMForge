import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-visibility-projects-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.TALORDATA_API_TOKEN = "test-token";

const auth: AuthContext = {
  userId: "u1",
  email: "editor@example.com",
  name: "에디터",
  workspaceId: "w1",
  workspaceName: "워크스페이스",
  workspacePlan: "pro",
  role: "editor",
  sessionId: "s1",
  ip: null,
  userAgent: null,
};

let projects: typeof import("./projects");
let runs: typeof import("./runs");
let brandPerformance: typeof import("./brand-performance");

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.exec("INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')");
  sqlite.exec("INSERT INTO folders (id,workspace_id,name,domain) VALUES ('f1','w1','Acme','www.example.com'),('f2','w2','외부','outside.test')");
  sqlite.exec("INSERT INTO ai_visibility_queries (id,workspace_id,domain,query,normalized_query,country_code) VALUES ('legacy-q','w1','example.com','Acme 추천','acme 추천','KR')");
  sqlite.exec("INSERT INTO ai_visibility_snapshots (id,query_id,aio_present,cited,captured_at) VALUES ('legacy-s','legacy-q',1,NULL,1000)");
  sqlite.close();
  projects = await import("./projects");
  runs = await import("./runs");
  brandPerformance = await import("./brand-performance");
  await projects.saveAiVisibilitySettings(auth, "f1", {
    brandName: "Acme",
    brandAliases: ["에크미", "ACME Korea"],
    providers: ["google_aio"],
    locationKeys: ["KR-SEOUL", "US-NEW-YORK"],
    schedule: "weekly",
  });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("프로젝트 설정은 별칭 5개·국가 2개를 지키고 같은 국가 중복을 거부한다", async () => {
  const saved = await projects.getAiVisibilitySettings(auth, "f1");
  assert.equal(saved.project?.brandAliases.length, 2);
  assert.deepEqual(saved.project?.locationKeys, ["KR-SEOUL", "US-NEW-YORK"]);

  await assert.rejects(
    projects.saveAiVisibilitySettings(auth, "f1", {
      brandName: "Acme",
      providers: ["google_aio"],
      locationKeys: ["KR-SEOUL", "KR-BUSAN"],
      schedule: "weekly",
    }),
    /한 국가에서는 대표 위치를 한 개만/,
  );
});

test("구 AIO cited=null은 unknown으로 이관하고 URL을 추정하지 않는다", async () => {
  const { db } = await import("@/db/client");
  const { aiVisibilityCitations, aiVisibilityObservations } = await import("@/db/schema");
  const observations = await db.select().from(aiVisibilityObservations);
  const citations = await db.select().from(aiVisibilityCitations);
  const migrated = observations.find((row) => row.source === "legacy-talordata");
  assert.equal(migrated?.visibilityStatus, "unknown");
  assert.equal(migrated?.citationsAvailable, false);
  assert.equal(citations.length, 0);
});

test("수동·CSV 프롬프트는 공백·대소문자 중복을 제거하고 20개 상한을 적용한다", async () => {
  const added = await projects.addAiVisibilityPrompts(auth, "f1", {
    source: "csv",
    prompts: [
      { prompt: "  협업   도구 추천  ", topic: "협업" },
      { prompt: "협업 도구 추천", topic: "중복" },
      { prompt: "ACME 추천", topic: "레거시 중복" },
    ],
  });
  assert.equal(added.added, 1);

  await assert.rejects(
    projects.addAiVisibilityPrompts(auth, "f1", {
      source: "manual",
      prompts: Array.from({ length: 20 }, (_, index) => ({ prompt: `새 프롬프트 ${index}` })),
    }),
    /최대 20개/,
  );
});

test("활성 실행 중 중복 요청은 같은 실행 ID를 반환하고 행렬 크기를 고정한다", async () => {
  const first = await runs.createAiVisibilityRun(auth, "f1", "manual");
  const second = await runs.createAiVisibilityRun(auth, "f1", "manual");
  assert.equal(second.reused, true);
  assert.equal(second.runId, first.runId);
  // 레거시 1 + 신규 1 프롬프트 × Google 1개 × 국가 2개
  assert.equal(first.total, 4);
});

test("다른 워크스페이스의 fid는 조회할 수 없다", async () => {
  await assert.rejects(projects.getAiVisibilitySettings(auth, "f2"), /프로젝트를 찾을 수 없습니다/);
});

test("기본 진입은 소유한 설정 완료 프로젝트를 우선하고 외부 fid를 선택하지 않는다", async () => {
  assert.equal(await projects.resolveDefaultAiVisibilityFolder(auth), "f1");
  assert.equal((await projects.findOwnedAiFolder(auth, "f1"))?.id, "f1");
  assert.equal(await projects.findOwnedAiFolder(auth, "f2"), null);
});

test("포지션 추적 키워드가 없으면 가져오기 가능 여부와 사유를 반환한다", async () => {
  const settings = await projects.getAiVisibilitySettings(auth, "f1");
  assert.equal(settings.imports.positionTracking.available, false);
  assert.equal(settings.imports.positionTracking.keywordCount, 0);
  assert.match(settings.imports.positionTracking.reason ?? "", /포지션 추적 캠페인이 없습니다/);
});

test("런타임에서 비활성인 공급자는 직접 API 저장도 거부한다", async () => {
  await assert.rejects(
    projects.saveAiVisibilitySettings(auth, "f1", {
      brandName: "Acme",
      providers: ["gemini_grounded"],
      locationKeys: ["KR-SEOUL"],
      schedule: "weekly",
    }),
    /선택할 수 없습니다/,
  );
});

test("브랜드 성과는 본문 공급자가 없을 때 가짜 리포트 대신 준비 상태를 반환한다", async () => {
  const dashboard = await brandPerformance.getBrandPerformanceDashboard(auth, "f1");
  assert.equal(dashboard.state, "provider_unavailable");
  assert.equal(dashboard.report, null);
  assert.equal(dashboard.scope.promptCount, 2);
  await assert.rejects(
    brandPerformance.getBrandPerformanceDashboard(auth, "f2"),
    /프로젝트를 찾을 수 없습니다/,
  );
});

test("경쟁 브랜드 저장은 워크스페이스 소유권과 4개 상한·중복을 검증한다", async () => {
  const saved = await brandPerformance.saveBrandPerformanceBrands(auth, "f1", [
    { name: "Beta", aliases: ["Beta Korea"], domain: "beta.test" },
    { name: "Gamma" },
  ]);
  assert.equal(saved.filter((brand) => brand.kind === "own").length, 1);
  assert.deepEqual(
    saved.filter((brand) => brand.kind === "competitor" && brand.enabled).map((brand) => brand.name),
    ["Beta", "Gamma"],
  );
  await assert.rejects(
    brandPerformance.saveBrandPerformanceBrands(auth, "f1", [{ name: "Beta" }, { name: " beta " }]),
    /중복해서 선택할 수 없습니다/,
  );
  await assert.rejects(
    brandPerformance.saveBrandPerformanceBrands(auth, "f1", [
      { name: "A1" }, { name: "A2" }, { name: "A3" }, { name: "A4" }, { name: "A5" },
    ]),
    /최대 4개/,
  );
});
