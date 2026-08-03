import assert from "node:assert/strict";
import test from "node:test";
import { buildToolkitToolHref } from "./toolkit-navigation";

test("AI 가시성 개요 링크는 fid와 공식 기본 필터를 포함한다", () => {
  assert.equal(
    buildToolkitToolHref({
      toolkitKey: "ai",
      href: "/ai-seo/overview/",
      selectedFolderId: "folder-1",
    }),
    "/ai-seo/overview/?fid=folder-1&range=1m&tab=top_topics&page=1",
  );
});

test("AI 하위 도구는 fid만 유지하고 개요 필터를 추가하지 않는다", () => {
  assert.equal(
    buildToolkitToolHref({
      toolkitKey: "ai",
      href: "/ai-seo/prompt-research/",
      selectedFolderId: "folder-1",
    }),
    "/ai-seo/prompt-research/?fid=folder-1",
  );
});

test("프로젝트 범위를 사용하지 않는 툴킷 링크는 변경하지 않는다", () => {
  assert.equal(
    buildToolkitToolHref({
      toolkitKey: "seo",
      href: "/siteaudit/",
      selectedFolderId: "folder-1",
    }),
    "/siteaudit/",
  );
});

test("소셜 대시보드와 하위 도구 링크는 현재 fid를 유지한다", () => {
  assert.equal(
    buildToolkitToolHref({
      toolkitKey: "social",
      href: "/social-media/",
      selectedFolderId: "folder-social",
    }),
    "/social-media/?fid=folder-social",
  );
  assert.equal(
    buildToolkitToolHref({
      toolkitKey: "social",
      href: "/social-media/poster/",
      selectedFolderId: "folder-social",
    }),
    "/social-media/poster/?fid=folder-social",
  );
});
