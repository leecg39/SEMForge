import assert from "node:assert/strict";
import { test } from "node:test";
import { translateContentText } from "@/i18n/content";
import { translateSiteText } from "@/i18n/site";

// Regression: ISSUE-010 — 영어 로케일의 콘텐츠 제작 화면과 프로젝트 선택기가 한국어로 남았음
// Found by /qa on 2026-08-04
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-04.md
test("콘텐츠 제작 핵심 카피와 공통 프로젝트 선택기를 로케일에 맞게 번역한다", () => {
  assert.equal(
    translateContentText("en", "글·이미지·영상을 한곳에서 제작하세요"),
    "Create articles, images, and videos in one place",
  );
  assert.equal(translateContentText("en", "연계 제작 시작"), "Start linked production");
  assert.equal(translateContentText("en", "완료"), "Completed");
  assert.equal(translateContentText("ko", "완료"), "완료");
  assert.equal(translateContentText("en", "사용자 작성 제목"), "사용자 작성 제목");

  assert.equal(translateSiteText("en", "Select project"), "Select project");
  assert.equal(translateSiteText("ko", "Select project"), "프로젝트 선택");
  assert.equal(translateSiteText("en", "My projects"), "My projects");
  assert.equal(translateSiteText("ko", "My projects"), "내 프로젝트");
});
