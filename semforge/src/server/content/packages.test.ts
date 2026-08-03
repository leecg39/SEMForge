import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-packages-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.CONTENT_ASSET_ROOT = path.join(tmpDir, "assets");

type PackageModule = typeof import("@/server/content/packages");
let createContentPackage: PackageModule["createContentPackage"];
let getContentPackage: PackageModule["getContentPackage"];
let approveContentPackage: PackageModule["approveContentPackage"];
let regenerateContentPackage: PackageModule["regenerateContentPackage"];
let cancelContentPackage: PackageModule["cancelContentPackage"];
let sqlite: Database.Database;

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

before(async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.exec("INSERT INTO users (id,email,name,password_hash,password_salt) VALUES ('u1','editor@example.com','에디터','x','x'),('u2','outside@example.com','외부','x','x')");
  sqlite.exec("INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')");
  sqlite.exec("INSERT INTO content_articles (id,workspace_id,title,keyword,meta_description,body,created_by,updated_by) VALUES ('article-1','w1','자사몰 SEO 실전 가이드','자사몰 SEO','처음 시작하는 운영자를 위한 가이드','# 자사몰 SEO\n\n## 검색 의도\n\n실제 실행 순서를 설명합니다.','u1','u1')");
  ({ createContentPackage, getContentPackage, approveContentPackage, regenerateContentPackage, cancelContentPackage } = await import("@/server/content/packages"));
});

after(() => {
  sqlite.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function existingPackage(idempotencyKey: string, targetStage: "article" | "image" | "video" = "video") {
  return createContentPackage(auth, {
    startMode: "existing_article",
    idempotencyKey,
    sourceArticleId: "article-1",
    title: "자사몰 SEO 연계 캠페인",
    brief: "기사의 실행 메시지를 하나의 시각 언어로 이미지와 영상까지 확장",
    targetStage,
  });
}

test("기존 기사 패키지는 idempotency와 workspace 격리를 보장한다", async () => {
  const first = await existingPackage("package-existing-idempotent", "article");
  const second = await existingPackage("package-existing-idempotent", "article");
  assert.equal(second.id, first.id);
  assert.equal(second.reused, true);
  assert.equal(first.currentStep, "article_review");
  assert.equal(first.status, "awaiting_approval");
  await assert.rejects(() => getContentPackage(outsider, first.id), /찾을 수 없습니다/u);

  const articleItem = first.activeItems.article!;
  const completed = await approveContentPackage(auth, first.id, {
    gate: "article",
    itemId: articleItem.id,
    itemVersion: articleItem.version,
    packageVersion: first.version,
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.currentStep, "complete");
});

test("동일 패키지 승인 동시 요청은 하나만 반영하고 나머지는 충돌로 종료한다", async () => {
  const created = await existingPackage("package-concurrent-approval", "article");
  const articleItem = created.activeItems.article!;
  const input = {
    gate: "article" as const,
    itemId: articleItem.id,
    itemVersion: articleItem.version,
    packageVersion: created.version,
  };

  const attempts = await Promise.allSettled(
    Array.from({ length: 5 }, () => approveContentPackage(auth, created.id, input)),
  );
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 4);
  assert.ok(attempts
    .filter((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected")
    .every((attempt) => (attempt.reason as { code?: string }).code === "VERSION_CONFLICT"));

  const completed = await getContentPackage(auth, created.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.currentStep, "complete");
});

test("기사·이미지 승인은 다음 비용 단계를 순서대로 열고 Visual Bible 원본을 고정한다", async () => {
  const created = await existingPackage("package-video-pipeline", "video");
  const articleItem = created.activeItems.article!;
  const imaging = await approveContentPackage(auth, created.id, {
    gate: "article",
    itemId: articleItem.id,
    itemVersion: articleItem.version,
    packageVersion: created.version,
    nextSettings: {
      image: {
        preset: "hero",
        stylePreset: "editorial_photo",
        displayTitle: "좌측 상단 이미지 제목",
        showTitle: true,
        titlePosition: "top_left",
        showLogo: true,
        focalX: 50,
        focalY: 50,
      },
    },
  });
  assert.equal(imaging.currentStep, "image");
  assert.equal(imaging.status, "active");
  assert.ok(imaging.activeItems.image?.production);

  const imageProductionId = imaging.activeItems.image!.production!.id;
  const imageSettings = sqlite.prepare("SELECT settings_json FROM content_productions WHERE id=?").get(imageProductionId) as { settings_json: string };
  assert.equal(JSON.parse(imageSettings.settings_json).titlePosition, "top_left");
  const specification = {
    concept: "검색 성장을 표현하는 상승 궤적",
    subject: "성장 그래프",
    palette: ["#ff5a1f", "#18181b", "#f4e9d8"],
    mood: "명확하고 진취적",
    altText: "상승하는 검색 성장 그래프",
    seed: 42,
  };
  sqlite.prepare("UPDATE content_productions SET status='ready', stage='persist', result_json=?, version=version+1 WHERE id=?")
    .run(JSON.stringify({ specification }), imageProductionId);
  sqlite.prepare("INSERT INTO content_production_assets (id,workspace_id,production_id,kind,storage_key,mime_type,width,height,byte_size,sha256,alt_text,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("asset-approved-image", "w1", imageProductionId, "image_result", "w1/package/image.jpg", "image/jpeg", 1280, 720, 1024, "a".repeat(64), "대표 이미지", "u1", "u1");

  const reviewing = await getContentPackage(auth, created.id);
  assert.equal(reviewing.currentStep, "image_review");
  assert.equal(reviewing.status, "awaiting_approval");
  const imageItem = reviewing.activeItems.image!;
  const video = await approveContentPackage(auth, created.id, {
    gate: "image",
    itemId: imageItem.id,
    itemVersion: imageItem.version,
    packageVersion: reviewing.version,
  });
  assert.equal(video.currentStep, "video");
  assert.equal(video.activeItems.video?.production?.sourceProductionId, imageProductionId);
  assert.equal(video.activeItems.video?.production?.sourceAssetId, "asset-approved-image");
  assert.equal(video.activeItems.video?.production?.sourceAssetSha256, "a".repeat(64));
  const input = sqlite.prepare("SELECT input_json FROM content_productions WHERE id=?").get(video.activeItems.video!.production!.id) as { input_json: string };
  assert.deepEqual(JSON.parse(input.input_json).sourceVisual.specification, specification);
});

test("최신 원본 재생성은 기존 revision을 보존하고 새 revision만 활성화한다", async () => {
  const created = await existingPackage("package-regenerate", "image");
  const articleItem = created.activeItems.article!;
  const imaging = await approveContentPackage(auth, created.id, {
    gate: "article",
    itemId: articleItem.id,
    itemVersion: articleItem.version,
    packageVersion: created.version,
  });
  const regenerated = await regenerateContentPackage(auth, created.id, {
    kind: "image",
    fromLatestSource: true,
    packageVersion: imaging.version,
    nextSettings: {
      image: {
        ...imaging.settings.image,
        displayTitle: "새 revision 상단 제목",
        titlePosition: "top_left",
      },
    },
  });
  const images = regenerated.items.filter((item) => item.kind === "image");
  assert.equal(images.length, 2);
  assert.deepEqual(images.map((item) => item.revision), [1, 2]);
  assert.equal(images.find((item) => item.revision === 1)?.status, "superseded");
  assert.equal(regenerated.activeItems.image?.revision, 2);
  assert.equal(regenerated.settings.image.titlePosition, "top_left");
  const regeneratedProductionSettings = regenerated.activeItems.image?.production?.settings as { titlePosition?: string };
  assert.equal(regeneratedProductionSettings.titlePosition, "top_left");
  assert.equal(images.find((item) => item.revision === 1)?.production?.status, "cancelled");
  await assert.rejects(() => regenerateContentPackage(auth, created.id, {
    kind: "image",
    fromLatestSource: true,
    packageVersion: imaging.version,
  }), /다른 곳에서 수정/u);
});

test("새 글 패키지 취소는 현재 run만 중단하고 패키지를 복원 가능하게 남긴다", async () => {
  const created = await createContentPackage(auth, {
    startMode: "new_article",
    idempotencyKey: "package-new-cancel",
    title: "새 글 연계 제작",
    brief: "새 기사를 만든 뒤 대표 이미지까지 제작",
    targetStage: "image",
    articleSettings: { keyword: "콘텐츠 제작" },
  });
  assert.equal(created.activeItems.article?.board?.runs[0]?.status, "queued");
  const cancelled = await cancelContentPackage(auth, created.id, { version: created.version });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.activeItems.article?.board?.runs[0]?.status, "cancelled");
  assert.equal(cancelled.activeItems.article?.status, "active");
});
