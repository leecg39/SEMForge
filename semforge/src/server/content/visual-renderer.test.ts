import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  generateSourceArtwork,
  MAX_VARIANT_BYTES,
  renderProductionImage,
  renderVisualVariants,
  VISUAL_SOURCE_SIZE,
  VISUAL_VARIANTS,
} from "@/server/content/visual-renderer";

const specification = {
  concept: "검색 성장을 상징하는 중심형 유기 곡선",
  subject: "검색 성장",
  palette: ["#ff5a1f", "#18181b", "#f4e9d8"],
  mood: "명확하고 신뢰감 있음",
  altText: "검색 성장 흐름을 표현한 추상 그래픽",
  seed: 42,
};

test("ChatMock 명세에서 결정적인 원본 WebP를 만든다", async () => {
  const first = await generateSourceArtwork({
    stylePreset: "illustration",
    specification,
    primaryColor: "#ff5a1f",
    secondaryColor: "#18181b",
  });
  const second = await generateSourceArtwork({
    stylePreset: "illustration",
    specification,
    primaryColor: "#ff5a1f",
    secondaryColor: "#18181b",
  });
  assert.deepEqual(first, second);
  const metadata = await sharp(first).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, VISUAL_SOURCE_SIZE.width);
  assert.equal(metadata.height, VISUAL_SOURCE_SIZE.height);
});

test("한글 제목을 포함한 썸네일·OG SVG를 정확한 크기로 렌더링한다", async () => {
  const source = await generateSourceArtwork({
    stylePreset: "minimal_3d",
    specification,
    primaryColor: "#ff5a1f",
    secondaryColor: "#18181b",
  });
  const variants = await renderVisualVariants({
    source,
    presentation: {
      displayTitle: "처음 시작하는 자사몰 SEO 실전 가이드",
      showTitle: true,
      showLogo: true,
      focalX: 50,
      focalY: 50,
    },
    brand: {
      brandName: "SEMForge 콘텐츠 연구소",
      primaryColor: "#ff5a1f",
      secondaryColor: "#18181b",
      logo: null,
    },
  });
  const thumbnail = await sharp(variants.thumbnail).metadata();
  const openGraph = await sharp(variants.openGraph).metadata();
  assert.equal(thumbnail.format, "svg");
  assert.equal(thumbnail.width, VISUAL_VARIANTS.thumbnail.width);
  assert.equal(thumbnail.height, VISUAL_VARIANTS.thumbnail.height);
  assert.equal(openGraph.format, "svg");
  assert.equal(openGraph.width, VISUAL_VARIANTS.open_graph.width);
  assert.equal(openGraph.height, VISUAL_VARIANTS.open_graph.height);
  assert.match(variants.thumbnail.toString("utf8"), /처음 시작하는 자사몰 SEO 실전 가이드/u);
  assert.match(variants.thumbnail.toString("utf8"), /data:image\/webp;base64,/u);
  assert.ok(variants.thumbnail.length <= MAX_VARIANT_BYTES);
  assert.ok(variants.openGraph.length <= MAX_VARIANT_BYTES);
});

test("이미지 제목 위치에 따라 상단 또는 하단에 대비 레이어를 합성한다", async () => {
  const source = await sharp({
    create: {
      width: VISUAL_SOURCE_SIZE.width,
      height: VISUAL_SOURCE_SIZE.height,
      channels: 3,
      background: "#ffffff",
    },
  }).webp().toBuffer();
  const common = {
    source,
    preset: "hero" as const,
    brand: {
      brandName: "SEMForge",
      primaryColor: "#ff5a1f",
      secondaryColor: "#18181b",
      logo: null,
    },
  };
  const [topLeft, bottomLeft] = await Promise.all([
    renderProductionImage({
      ...common,
      presentation: { displayTitle: "좌측 상단 제목", showTitle: true, titlePosition: "top_left", showLogo: false, focalX: 50, focalY: 50 },
    }),
    renderProductionImage({
      ...common,
      presentation: { displayTitle: "좌측 하단 제목", showTitle: true, titlePosition: "bottom_left", showLogo: false, focalX: 50, focalY: 50 },
    }),
  ]);
  const brightness = async (bytes: Buffer, top: number) => {
    const crop = await sharp(bytes).extract({ left: 0, top, width: 1280, height: 300 }).png().toBuffer();
    const stats = await sharp(crop).stats();
    return stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
  };
  const [topImageTop, topImageBottom, bottomImageTop, bottomImageBottom] = await Promise.all([
    brightness(topLeft.bytes, 0),
    brightness(topLeft.bytes, 420),
    brightness(bottomLeft.bytes, 0),
    brightness(bottomLeft.bytes, 420),
  ]);
  assert.ok(topImageTop < topImageBottom);
  assert.ok(bottomImageBottom < bottomImageTop);
});
