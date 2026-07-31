import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LLMS_TXT_MAX_ESTIMATED_TOKENS,
  assessLlmsTxt,
  parseLlmsTxt,
} from "@/server/ai-visibility/llms-txt";

const COMPLETE_DOCUMENT = `# SEMForge
> 검색 가시성을 한곳에서 진단합니다.

SEMForge는 검색 및 AI 가시성 분석 도구입니다.

## 주요 문서
- [시작 안내](https://example.com/docs/start): 처음 사용하는 방법
- [API 문서](https://example.com/docs/api)

## Optional
- [변경 기록](https://example.com/changelog): 이전 버전의 변경 사항
`;

test("완전한 llms.txt 문서를 구조화해 파싱한다", () => {
  assert.deepEqual(parseLlmsTxt(COMPLETE_DOCUMENT), {
    title: "SEMForge",
    summary: "검색 가시성을 한곳에서 진단합니다.",
    description: "SEMForge는 검색 및 AI 가시성 분석 도구입니다.",
    sections: [
      {
        name: "주요 문서",
        links: [
          {
            title: "시작 안내",
            url: "https://example.com/docs/start",
            note: "처음 사용하는 방법",
          },
          { title: "API 문서", url: "https://example.com/docs/api", note: null },
        ],
      },
      {
        name: "Optional",
        links: [
          {
            title: "변경 기록",
            url: "https://example.com/changelog",
            note: "이전 버전의 변경 사항",
          },
        ],
      },
    ],
  });

  const assessment = assessLlmsTxt(COMPLETE_DOCUMENT);
  assert.equal(assessment.isLlmsTxt, true);
  assert.equal(assessment.score, 100);
  assert.equal(assessment.grade, "A");
  assert.equal(assessment.checks.h1.status, "pass");
  assert.equal(assessment.checks.summary.status, "pass");
  assert.equal(assessment.checks.sections.status, "pass");
  assert.equal(assessment.checks.links.status, "pass");
  assert.equal(assessment.checks.absoluteUrls.status, "pass");
  assert.equal(assessment.checks.linkTitles.status, "pass");
  assert.equal(assessment.checks.optionalSection.status, "pass");
  assert.equal(assessment.checks.length.status, "pass");
});

test("H1이 없으면 제목 검사를 실패 처리한다", () => {
  const source = `> 요약입니다.

## 문서
- [안내](https://example.com/docs)
`;
  const assessment = assessLlmsTxt(source);

  assert.equal(assessment.isLlmsTxt, true);
  assert.equal(assessment.checks.h1.status, "fail");
  assert.match(assessment.checks.h1.reason, /없/);
});

test("H1이 두 개 이상이면 제목 검사를 실패 처리한다", () => {
  const source = `# 첫 번째 제목
# 두 번째 제목

## 문서
- [안내](https://example.com/docs)
`;
  const assessment = assessLlmsTxt(source);

  assert.equal(assessment.checks.h1.status, "fail");
  assert.match(assessment.checks.h1.reason, /2개/);
});

test("blockquote 요약이 없으면 요약 검사를 실패 처리한다", () => {
  const assessment = assessLlmsTxt(`# 제목

## 문서
- [안내](https://example.com/docs)
`);

  assert.equal(assessment.checks.summary.status, "fail");
  assert.match(assessment.checks.summary.reason, /요약/);
});

test("H2 섹션이 없으면 섹션과 링크 검사를 실패 처리한다", () => {
  const assessment = assessLlmsTxt(`# 제목
> 요약

설명만 있는 문서입니다.
`);

  assert.equal(assessment.isLlmsTxt, true);
  assert.equal(assessment.checks.sections.status, "fail");
  assert.equal(assessment.checks.links.status, "fail");
});

test("상대경로 링크는 경고하고 점수를 차감한다", () => {
  const source = `# 제목
> 요약

## 문서
- [상대 링크](/docs/start): 내부 문서
`;
  const assessment = assessLlmsTxt(source);

  assert.equal(assessment.checks.absoluteUrls.status, "warning");
  assert.equal(assessment.checks.absoluteUrls.passed, false);
  assert.match(assessment.checks.absoluteUrls.reason, /상대경로/);
  assert.ok(assessment.score < 100);
});

test("빈 링크 제목을 검출한다", () => {
  const source = `# 제목
> 요약

## 문서
- [](https://example.com/docs)
`;
  const assessment = assessLlmsTxt(source);

  assert.equal(assessment.checks.linkTitles.status, "fail");
  assert.match(assessment.checks.linkTitles.reason, /비어/);
});

test("빈 문자열은 llms.txt가 아닌 것으로 판정한다", () => {
  const assessment = assessLlmsTxt("   \n\t");

  assert.equal(assessment.isLlmsTxt, false);
  assert.equal(assessment.invalidReason, "문서가 비어 있어 llms.txt로 볼 수 없습니다.");
  assert.equal(assessment.score, 0);
  assert.equal(assessment.grade, "F");
});

test("HTML 404 본문은 llms.txt가 아닌 것으로 판정한다", () => {
  const html = `<!doctype html><html><head><title>404</title></head><body>Not found</body></html>`;
  const assessment = assessLlmsTxt(html);

  assert.equal(assessment.isLlmsTxt, false);
  assert.match(assessment.invalidReason ?? "", /HTML/);
  assert.equal(assessment.score, 0);
});

test("마크다운 구조가 전혀 없는 일반 텍스트는 llms.txt가 아니다", () => {
  const assessment = assessLlmsTxt("요청한 페이지를 찾을 수 없습니다.");

  assert.equal(assessment.isLlmsTxt, false);
  assert.match(assessment.invalidReason ?? "", /마크다운 구조/);
});

test("Optional 섹션 사용 여부를 대소문자와 무관하게 진단한다", () => {
  const assessment = assessLlmsTxt(`# 제목
> 요약

## optional
- [보조 문서](https://example.com/optional)
`);

  assert.equal(assessment.checks.optionalSection.status, "pass");
  assert.match(assessment.checks.optionalSection.reason, /낮은 우선순위/);
});

test("Optional 섹션이 없어도 선택 항목이므로 점수는 차감하지 않는다", () => {
  const source = `# 제목
> 요약

## 문서
- [안내](https://example.com/docs)
`;
  const assessment = assessLlmsTxt(source);

  assert.equal(assessment.checks.optionalSection.status, "fail");
  assert.equal(assessment.score, 100);
});

test("토큰 예산을 넘는 긴 문서를 경고하고 점수를 차감한다", () => {
  const longDescription = "가".repeat(LLMS_TXT_MAX_ESTIMATED_TOKENS * 4 + 1);
  const source = `# 제목
> 요약

${longDescription}

## 문서
- [안내](https://example.com/docs)
`;
  const assessment = assessLlmsTxt(source);

  assert.ok(assessment.estimatedTokens > LLMS_TXT_MAX_ESTIMATED_TOKENS);
  assert.equal(assessment.checks.length.status, "warning");
  assert.match(assessment.checks.length.reason, /토큰 예산/);
  assert.ok(assessment.score < 100);
});

test("파싱과 진단은 입력 원문을 변경하지 않는다", () => {
  const source = COMPLETE_DOCUMENT;

  parseLlmsTxt(source);
  assessLlmsTxt(source);

  assert.equal(source, COMPLETE_DOCUMENT);
});
