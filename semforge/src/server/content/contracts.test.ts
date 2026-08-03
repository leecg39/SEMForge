import assert from "node:assert/strict";
import test from "node:test";
import {
  contentVisualSpecificationSchema,
  contentRunInputSchema,
  createContentPackageSchema,
  createContentProductionSchema,
  createContentVisualSchema,
  generatedArticleSchema,
} from "@/server/content/contracts";

test("기사 실행 조건은 국가 코드와 기본값을 결정적으로 정규화한다", () => {
  const parsed = contentRunInputSchema.parse({
    keyword: "  자사몰 SEO  ",
    countryCode: "kr",
  });
  assert.equal(parsed.keyword, "자사몰 SEO");
  assert.equal(parsed.countryCode, "KR");
  assert.equal(parsed.language, "ko");
  assert.equal(parsed.targetWordCount, 1400);
  assert.equal(parsed.aiProfile, "chatmock-gpt-5.6-luna-xhigh");
  assert.throws(() => contentRunInputSchema.parse({ keyword: "SEO", aiProfile: "unknown-model" }));
});

test("연계 제작 계약은 시작점·목표 단계와 승인 비용 경계를 검증한다", () => {
  const linked = createContentPackageSchema.parse({
    startMode: "new_article",
    idempotencyKey: "linked-package-1",
    title: "검색 성장 콘텐츠 패키지",
    brief: "하나의 메시지를 글과 이미지, 영상으로 일관되게 전달",
    targetStage: "video",
    articleSettings: { keyword: "검색 성장" },
  });
  assert.equal(linked.startMode, "new_article");
  assert.equal(linked.imageSettings.stylePreset, "editorial_photo");
  assert.equal(linked.imageSettings.titlePosition, "bottom_left");
  assert.equal(linked.videoSettings.targetDuration, 45);
  assert.equal(linked.videoSettings.nativeAudio, true);

  const existing = createContentPackageSchema.parse({
    startMode: "existing_article",
    idempotencyKey: "linked-package-2",
    sourceArticleId: "article-1",
    title: "기존 기사 확장",
    brief: "승인된 기존 기사를 대표 이미지까지 확장",
    targetStage: "image",
  });
  assert.equal(existing.startMode, "existing_article");
  assert.throws(() => createContentPackageSchema.parse({
    startMode: "existing_article",
    idempotencyKey: "linked-package-3",
    title: "원본 없는 패키지",
    brief: "연결 기사 없이 시작할 수 없음",
    targetStage: "video",
  }));
});

test("이미지·영상 제작 계약은 비용과 렌더링 경계를 검증한다", () => {
  const image = createContentProductionSchema.parse({
    kind: "image",
    idempotencyKey: "image-request-1",
    title: "검색 성장을 설명하는 이미지",
    prompt: "검색 성장 흐름을 명확하게 표현",
    settings: {
      displayTitle: "검색 성장",
    },
  });
  assert.equal(image.kind, "image");
  if (image.kind !== "image") throw new Error("이미지 계약이어야 합니다.");
  assert.equal(image.settings.preset, "hero");
  assert.equal(image.settings.focalX, 50);
  assert.equal(image.settings.titlePosition, "bottom_left");

  const video = createContentProductionSchema.parse({
    kind: "video",
    idempotencyKey: "video-request-1",
    title: "검색 성장 영상",
    prompt: "실행 과정을 장면별로 설명",
    settings: {},
  });
  assert.equal(video.kind, "video");
  if (video.kind !== "video") throw new Error("영상 계약이어야 합니다.");
  assert.equal(video.settings.targetDuration, 45);
  assert.equal(video.settings.nativeAudio, true);
  assert.throws(() => createContentProductionSchema.parse({
    kind: "video",
    idempotencyKey: "video-request-2",
    title: "잘못된 영상",
    prompt: "잘못된 길이",
    settings: { targetDuration: 40, nativeAudio: true },
  }));
});

test("비주얼 계약은 스타일·제목·색상 명세를 엄격하게 검증한다", () => {
  const input = createContentVisualSchema.parse({
    idempotencyKey: "visual-request",
    stylePreset: "minimal_3d",
    displayTitle: "한글 제목",
  });
  assert.equal(input.focalX, 50);
  assert.equal(input.showTitle, true);
  assert.throws(() => contentVisualSpecificationSchema.parse({
    concept: "구성",
    subject: "주제",
    palette: ["red", "#ffffff", "#000000"],
    mood: "명확함",
    altText: "대체 텍스트",
    seed: 1,
  }));
});

test("Markdown 출력 스키마는 비어 있거나 지나치게 짧은 초안을 거부한다", () => {
  assert.throws(() => generatedArticleSchema.parse({
    title: "제목",
    metaDescription: "설명",
    markdown: "짧은 글",
  }));
  assert.doesNotThrow(() => generatedArticleSchema.parse({
    title: "제목",
    metaDescription: "검색 결과에 표시할 구체적인 설명입니다.",
    markdown: `# 제목\n\n${"충분한 본문 내용 ".repeat(20)}`,
  }));
});
