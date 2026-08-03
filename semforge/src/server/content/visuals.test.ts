import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-visuals-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.CONTENT_ASSET_ROOT = path.join(tmpDir, "assets");
process.env.CHATMOCK_BASE_URL = "http://chatmock.test:8000/v1";

type VisualsModule = typeof import("@/server/content/visuals");
let createContentVisual: VisualsModule["createContentVisual"];
let getContentVisual: VisualsModule["getContentVisual"];
let listContentVisuals: VisualsModule["listContentVisuals"];
let processContentVisualStage: VisualsModule["processContentVisualStage"];
let updateContentVisual: VisualsModule["updateContentVisual"];
let activateContentVisual: VisualsModule["activateContentVisual"];
let getContentAssetFile: VisualsModule["getContentAssetFile"];
let normalizeVisualSpecification: VisualsModule["normalizeVisualSpecification"];
let getContentBrandKit: VisualsModule["getContentBrandKit"];
let updateContentBrandKit: VisualsModule["updateContentBrandKit"];
let uploadContentBrandLogo: VisualsModule["uploadContentBrandLogo"];

const auth = {
  userId: "u1",
  email: "editor@example.com",
  name: "에디터",
  workspaceId: "w1",
  workspaceName: "워크스페이스",
  workspacePlan: "pro" as const,
  role: "editor" as const,
  sessionId: "s1",
  ip: null,
  userAgent: null,
};
const outsider = { ...auth, userId: "u2", workspaceId: "w2" };
const originalFetch = globalThis.fetch;
let generationCalls = 0;

before(async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.exec("INSERT INTO users (id,email,name,password_hash,password_salt) VALUES ('u1','editor@example.com','에디터','x','x'),('u2','outside@example.com','외부','x','x')");
  sqlite.exec("INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')");
  sqlite.exec("INSERT INTO content_articles (id,workspace_id,title,keyword,meta_description,body,created_by,updated_by) VALUES ('article-1','w1','자사몰 SEO 실전 가이드','자사몰 SEO','처음 시작하는 운영자를 위한 가이드','# 자사몰 SEO\n\n## 검색 의도\n\n실제 실행 순서를 설명합니다.','u1','u1')");
  sqlite.close();
  ({
    createContentVisual,
    getContentVisual,
    listContentVisuals,
    processContentVisualStage,
    updateContentVisual,
    activateContentVisual,
    getContentAssetFile,
    normalizeVisualSpecification,
    getContentBrandKit,
    updateContentBrandKit,
    uploadContentBrandLogo,
  } = await import("@/server/content/visuals"));
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/health")) return Response.json({ status: "ok" });
    generationCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return Response.json({
      output_text: JSON.stringify({
        concept: "검색 성장을 표현한 중심형 추상 구성",
        subject: "검색 성장",
        palette: ["#ff5a1f", "#18181b", "#f4e9d8"],
        mood: "신뢰감 있고 명확함",
        altText: "검색 성장 흐름을 표현한 추상 그래픽",
        seed: 20260802,
      }),
    });
  };
});

test("ChatMock 명세의 과도한 문자열과 불완전한 팔레트를 안전하게 정규화한다", () => {
  const specification = normalizeVisualSpecification({
    concept: "개념".repeat(200),
    subject: "긴 주제".repeat(40),
    palette: ["#ff5a1f", "not-a-color"],
    mood: "",
    altText: "설명".repeat(200),
    seed: Number.MAX_SAFE_INTEGER,
  }, {
    subject: "자사몰 SEO",
    primaryColor: "#ff5a1f",
    secondaryColor: "#18181b",
  });

  assert.equal(Array.from(specification.subject).length, 80);
  assert.equal(Array.from(specification.concept).length, 280);
  assert.equal(Array.from(specification.altText).length, 240);
  assert.deepEqual(specification.palette, ["#ff5a1f", "#18181b", "#f4f4f5"]);
  assert.equal(specification.mood, "신뢰감 있고 명확함");
  assert.equal(specification.seed, 2_147_483_647);
});

test("브랜드 키트는 편집자가 읽을 수 있지만 관리자 이상만 수정할 수 있다", async () => {
  const initial = await getContentBrandKit(auth);
  assert.equal(initial.canManage, false);
  await assert.rejects(() => updateContentBrandKit(auth, {
    brandName: "SEMForge 콘텐츠 연구소",
    primaryColor: "#ff5a1f",
    secondaryColor: "#18181b",
    version: null,
  }), /관리자 이상/);

  const admin = { ...auth, role: "admin" as const };
  const saved = await updateContentBrandKit(admin, {
    brandName: "SEMForge 콘텐츠 연구소",
    primaryColor: "#FF5A1F",
    secondaryColor: "#18181B",
    version: null,
  });
  assert.equal(saved.brandName, "SEMForge 콘텐츠 연구소");
  assert.equal(saved.primaryColor, "#ff5a1f");
  assert.equal(saved.canManage, true);
  await assert.rejects(() => uploadContentBrandLogo(admin, Buffer.from("not-an-image")), /처리할 수|지원되지 않는|unsupported image format/iu);
});

after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("ChatMock 호출 한 번으로 원본·썸네일·OG를 영속 생성하고 workspace를 격리한다", async () => {
  const created = await createContentVisual(auth, "article-1", {
    idempotencyKey: "visual-request-1",
    stylePreset: "illustration",
    displayTitle: "자사몰 SEO 실전 가이드",
    showTitle: true,
    showLogo: true,
    visualDirection: null,
    focalX: 50,
    focalY: 50,
  });
  const duplicate = await createContentVisual(auth, "article-1", {
    idempotencyKey: "visual-request-1",
    stylePreset: "illustration",
    displayTitle: "자사몰 SEO 실전 가이드",
    showTitle: true,
    showLogo: true,
    visualDirection: null,
    focalX: 50,
    focalY: 50,
  });
  assert.equal(duplicate.id, created.id);
  await processContentVisualStage(auth, created.id);
  await Promise.all([
    processContentVisualStage(auth, created.id),
    processContentVisualStage(auth, created.id),
  ]);
  await processContentVisualStage(auth, created.id);
  const ready = await getContentVisual(auth, created.id);
  assert.equal(generationCalls, 1);
  assert.equal(ready.status, "ready");
  assert.deepEqual(new Set(ready.assets.map((asset) => asset.kind)), new Set(["source", "thumbnail", "open_graph"]));
  const thumbnail = ready.assets.find((asset) => asset.kind === "thumbnail")!;
  const openGraph = ready.assets.find((asset) => asset.kind === "open_graph")!;
  assert.equal(thumbnail.mimeType, "image/svg+xml");
  assert.equal(openGraph.mimeType, "image/svg+xml");
  const file = await getContentAssetFile(auth, thumbnail.id);
  assert.match(file.asset.storageKey, /thumbnail\.svg$/u);
  assert.match(file.bytes.toString("utf8"), /^<\?xml[^]*<svg/u);
  assert.ok(file.bytes.length > 1_000);
  await assert.rejects(() => getContentVisual(outsider, created.id), /찾을 수 없습니다/);
});

test("대표 세트 활성화 후 초점 변경은 ChatMock 재호출 없이 새 draft를 렌더링한다", async () => {
  const [ready] = await listContentVisuals(auth, "article-1");
  const active = await activateContentVisual(auth, ready.id);
  assert.ok(active.activeAt);
  const clone = await updateContentVisual(auth, active.id, {
    focalX: 85,
    focalY: 15,
    version: active.version,
  });
  assert.notEqual(clone.id, active.id);
  assert.equal(clone.stage, "render");
  const rendered = await processContentVisualStage(auth, clone.id);
  assert.equal(rendered.status, "ready");
  assert.equal(generationCalls, 1);
  assert.equal(rendered.focalX, 85);
  assert.equal(rendered.focalY, 15);
});
