import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import {
  readContentAsset,
  resolveContentAssetPath,
  visualAssetKey,
  writeContentAsset,
} from "@/server/content/visual-storage";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-assets-"));
process.env.CONTENT_ASSET_ROOT = root;

after(() => fs.rmSync(root, { recursive: true, force: true }));

test("생성된 storage key만 저장소 내부 경로로 해석한다", async () => {
  const key = visualAssetKey({
    workspaceId: "workspace_1",
    articleId: "article_1",
    visualId: "visual_1",
    filename: "thumbnail.svg",
  });
  const target = resolveContentAssetPath(key);
  assert.ok(target.startsWith(`${root}${path.sep}`));
  await writeContentAsset(key, Buffer.from("safe-image"));
  assert.equal((await readContentAsset(key)).toString(), "safe-image");
});

test("경로 이탈과 절대 경로를 거부한다", () => {
  assert.throws(() => resolveContentAssetPath("../secret"));
  assert.throws(() => resolveContentAssetPath("/tmp/secret"));
});
