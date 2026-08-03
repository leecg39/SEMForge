import assert from "node:assert/strict";
import test from "node:test";
import {
  applyContentSeoSuggestion,
  buildContentSeoSuggestions,
  undoContentSeoSuggestion,
} from "@/lib/content-seo";

const document = {
  title: "검색 성장 실전 가이드",
  metaDescription: "운영자가 검색 유입을 개선하는 실행 순서를 설명합니다.",
  body: "# 검색 성장 실전 가이드\n\n## 시작하기\n\n실행 순서를 설명합니다.",
};

test("SEO 제안은 현재 문서를 변형하지 않고 적용·되돌리기 토큰을 만든다", () => {
  const [suggestion] = buildContentSeoSuggestions(document, "자사몰 SEO");
  assert.ok(suggestion);
  const applied = applyContentSeoSuggestion(document, suggestion);
  assert.notEqual(applied.document, document);
  assert.equal(document.title, "검색 성장 실전 가이드");
  assert.match(applied.document.title, /자사몰 SEO/u);
  assert.ok(applied.undo);
  const undone = undoContentSeoSuggestion(applied.document, applied.undo!);
  assert.equal(undone.restored, true);
  assert.deepEqual(undone.document, document);
});

test("오래된 제안과 적용 후 수동 편집은 조용히 덮어쓰지 않는다", () => {
  const [suggestion] = buildContentSeoSuggestions(document, "자사몰 SEO");
  assert.ok(suggestion);
  const edited = { ...document, title: "사용자가 새로 쓴 제목" };
  assert.equal(applyContentSeoSuggestion(edited, suggestion).undo, null);
  const applied = applyContentSeoSuggestion(document, suggestion);
  const manuallyEdited = { ...applied.document, title: "적용 후 다시 편집한 제목" };
  const undone = undoContentSeoSuggestion(manuallyEdited, applied.undo!);
  assert.equal(undone.restored, false);
  assert.equal(undone.document.title, "적용 후 다시 편집한 제목");
});

test("제목·메타·소제목 제안은 같은 입력에서 결정적으로 생성된다", () => {
  const first = buildContentSeoSuggestions(document, "자사몰 SEO");
  const second = buildContentSeoSuggestions(document, "자사몰 SEO");
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((item) => item.field), ["title", "metaDescription", "body"]);
});
