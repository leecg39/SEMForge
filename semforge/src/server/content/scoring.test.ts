import assert from "node:assert/strict";
import test from "node:test";
import { scoreContentArticle } from "@/server/content/scoring";

const requirements = {
  keyword: "자사몰 SEO",
  title: null,
  audience: "자사몰 운영자",
  brandVoice: "명확한 전문가",
  language: "ko",
  countryCode: "KR",
  targetWordCount: 500,
  sourceUrl: null,
  aiProfile: "chatmock-gpt-5.6-luna-xhigh" as const,
};

const article = {
  title: "자사몰 SEO 실전 가이드",
  metaDescription: "자사몰 SEO를 처음 시작하는 운영자를 위한 검색 최적화 실전 체크리스트와 단계별 적용 방법을 소개합니다.",
  markdown: `# 자사몰 SEO 실전 가이드

자사몰 SEO는 검색 고객을 지속적으로 만나는 운영 기반입니다. 이 글은 우선순위를 설명합니다.

## 자사몰 SEO 목표 정하기

검색 의도와 고객 여정을 함께 확인합니다. 작은 범위부터 측정 가능한 목표를 정합니다.

## 키워드 조사와 검색 의도

- 핵심 키워드
- 검색 의도
- 콘텐츠 구조

## 사이트 구조 점검

페이지 제목과 내부 링크를 정리하고 검색 엔진이 이해할 수 있는 구조를 만듭니다.

## 실행 체크리스트

측정 결과를 매주 확인하고 중요한 페이지부터 개선합니다. 자사몰 SEO는 반복해서 개선해야 합니다.
`,
};

test("TalorData SERP 근거가 없으면 점수를 만들지 않고 사유를 반환한다", () => {
  const result = scoreContentArticle({ article, requirements, research: null });
  assert.equal(result.model, "semforge-content-v1");
  assert.equal(result.score, null);
  assert.match(result.unavailableReason ?? "", /TalorData/);
});

test("같은 입력은 semforge-content-v1 세부 점수를 동일하게 계산한다", () => {
  const research = {
    provider: "talordata" as const,
    keyword: "자사몰 SEO",
    countryCode: "KR",
    capturedAt: "2026-08-02T00:00:00.000Z",
    fromCache: false,
    volume: 100,
    intent: "informational",
    features: [],
    results: [
      { position: 1, title: "자사몰 SEO 키워드 조사", description: "검색 의도와 사이트 구조 체크리스트", link: "https://example.com/1" },
      { position: 2, title: "사이트 구조 최적화", description: "내부 링크와 콘텐츠 구조", link: "https://example.com/2" },
    ],
  };
  const first = scoreContentArticle({ article, requirements, research });
  const second = scoreContentArticle({ article, requirements, research });
  assert.deepEqual(first, second);
  assert.ok((first.score ?? 0) > 0 && (first.score ?? 0) <= 100);
  assert.equal(first.breakdown?.serpCoverage !== undefined, true);
});
