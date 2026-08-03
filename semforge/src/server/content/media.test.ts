import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-media-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.CONTENT_ASSET_ROOT = path.join(tmpDir, "assets");
process.env.CHATMOCK_BASE_URL = "http://chatmock.test:8000/v1";

type MediaModule = typeof import("@/server/content/media");
let createContentProduction: MediaModule["createContentProduction"];
let getContentProduction: MediaModule["getContentProduction"];
let processContentProduction: MediaModule["processContentProduction"];
let retryContentProduction: MediaModule["retryContentProduction"];

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

before(async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.exec("INSERT INTO users (id,email,name,password_hash,password_salt) VALUES ('u1','editor@example.com','에디터','x','x'),('u2','outside@example.com','외부','x','x')");
  sqlite.exec("INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')");
  sqlite.close();
  ({ createContentProduction, getContentProduction, processContentProduction, retryContentProduction } = await import("@/server/content/media"));
});

after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("이미지 production은 idempotency와 workspace 격리를 보장한다", async () => {
  const request = {
    kind: "image" as const,
    idempotencyKey: "media-image-idempotent",
    title: "검색 성장 대표 이미지",
    prompt: "중앙에 성장 흐름을 보여주는 추상 오브젝트",
    settings: {
      preset: "hero" as const,
      stylePreset: "abstract_graphic" as const,
      displayTitle: "검색 성장",
      showTitle: true,
      showLogo: false,
      focalX: 50,
      focalY: 50,
    },
  };
  const first = await createContentProduction(auth, request);
  const second = await createContentProduction(auth, request);
  assert.equal(second.id, first.id);
  assert.equal(second.reused, true);
  await assert.rejects(() => getContentProduction(outsider, first.id), /찾을 수 없습니다/u);
});

test("동일 이미지 stage 동시 호출은 ChatMock을 한 번만 호출하고 결과 파일을 저장한다", async () => {
  const created = await createContentProduction(auth, {
    kind: "image",
    idempotencyKey: "media-image-concurrent",
    title: "콘텐츠 성장을 보여주는 이미지",
    prompt: "중심에서 바깥으로 확장되는 명확한 구조",
    settings: {
      preset: "square",
      stylePreset: "illustration",
      displayTitle: "콘텐츠 성장",
      showTitle: true,
      showLogo: false,
      focalX: 50,
      focalY: 50,
    },
  });
  let healthCalls = 0;
  let responseCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/health")) {
      healthCalls += 1;
      return new Response("ok", { status: 200 });
    }
    responseCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return Response.json({
      output_text: JSON.stringify({
        concept: "중심에서 확장되는 유기적인 성장 궤적",
        subject: "콘텐츠 성장",
        palette: ["#ff5a1f", "#18181b", "#f4e9d8"],
        mood: "명확하고 전진하는 분위기",
        altText: "콘텐츠 성장 흐름을 나타낸 추상 이미지",
        seed: 42,
      }),
    });
  };

  await Promise.all([
    processContentProduction(auth, created.id),
    processContentProduction(auth, created.id),
  ]);
  await Promise.all([
    processContentProduction(auth, created.id),
    processContentProduction(auth, created.id),
  ]);
  const ready = await processContentProduction(auth, created.id);
  assert.equal(healthCalls, 1);
  assert.equal(responseCalls, 1);
  assert.equal(ready.status, "ready");
  assert.ok(ready.assets.some((asset) => asset.kind === "image_source"));
  assert.ok(ready.assets.some((asset) => asset.kind === "image_result" && asset.width === 1080 && asset.height === 1080));
  assert.ok(fs.readdirSync(process.env.CONTENT_ASSET_ROOT!, { recursive: true }).length >= 2);
});

test("공급자 환경 설정 검증 실패는 키 설정 후 안전하게 재시도할 수 있다", async () => {
  const created = await createContentProduction(auth, {
    kind: "image",
    idempotencyKey: "media-validation-retry",
    title: "환경 설정 재시도",
    prompt: "환경 설정을 확인하는 대표 이미지",
    settings: {
      preset: "hero",
      stylePreset: "editorial_photo",
      displayTitle: "환경 설정 재시도",
      showTitle: true,
      showLogo: false,
      focalX: 50,
      focalY: 50,
    },
  });
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });

  const failed = await processContentProduction(auth, created.id);
  assert.equal(failed.status, "failed");
  assert.equal((failed.error as { retryable?: boolean }).retryable, true);

  // 이전 릴리스가 validate 오류를 재시도 불가로 저장한 기존 작업도 복구되어야 한다.
  const legacyDb = new Database(process.env.DATABASE_PATH!);
  legacyDb.prepare("UPDATE content_productions SET error_json=? WHERE id=?")
    .run(JSON.stringify({ code: "VALIDATION_ERROR", message: "XAI_API_KEY가 필요합니다.", stage: "validate", retryable: false }), created.id);
  legacyDb.close();

  const retried = await retryContentProduction(auth, created.id);
  assert.equal(retried.status, "draft");
  assert.equal(retried.error.message ?? null, null);
});

test("영상 검증은 ChatMock 없이 XAI_API_KEY 하나로 Grok 모델 권한을 확인한다", async () => {
  const originalXaiKey = process.env.XAI_API_KEY;
  const originalVideoModel = process.env.XAI_VIDEO_MODEL;
  process.env.XAI_API_KEY = "test-xai-key";
  process.env.XAI_VIDEO_MODEL = "grok-imagine-video-1.5";
  const created = await createContentProduction(auth, {
    kind: "video",
    idempotencyKey: "media-xai-only-video-validation",
    title: "Grok 단독 영상",
    prompt: "Grok 인증 하나로 만드는 영상",
    settings: {
      targetDuration: 30,
      aspectRatio: "16:9",
      stylePreset: "editorial_photo",
      nativeAudio: true,
    },
  });
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    assert.equal(String(input), "https://api.x.ai/v1/video-generation-models");
    return Response.json({ models: [{ id: "grok-imagine-video-1.5" }] });
  };
  try {
    const validated = await processContentProduction(auth, created.id);
    assert.equal(validated.status, "planning");
    assert.equal(validated.stage, "plan");
    assert.equal(calls, 1);
  } finally {
    if (originalXaiKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = originalXaiKey;
    if (originalVideoModel === undefined) delete process.env.XAI_VIDEO_MODEL;
    else process.env.XAI_VIDEO_MODEL = originalVideoModel;
  }
});
