import path from "node:path";
import sharp from "sharp";
import type { ContentVisualSpecification, ContentVisualStyle } from "@/server/content/contracts";

export const VISUAL_SOURCE_SIZE = { width: 1536, height: 1024 } as const;
export const VISUAL_VARIANTS = {
  thumbnail: { width: 1280, height: 720 },
  open_graph: { width: 1200, height: 630 },
} as const;
export const PRODUCTION_IMAGE_PRESETS = {
  hero: { width: 1280, height: 720 },
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
} as const;
export const VIDEO_KEYFRAME_SIZES = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 720, height: 720 },
} as const;
export const MAX_VARIANT_BYTES = 1_500_000;

type Brand = {
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  logo?: Buffer | null;
};

type Presentation = {
  displayTitle: string;
  showTitle: boolean;
  titlePosition?: "top_left" | "bottom_left";
  showLogo: boolean;
  focalX: number;
  focalY: number;
};

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function artworkShapes(style: ContentVisualStyle, specification: ContentVisualSpecification): string {
  const random = mulberry32(specification.seed);
  const colors = specification.palette;
  if (style === "minimal_3d") {
    return Array.from({ length: 7 }, (_, index) => {
      const radius = 90 + random() * 230;
      const x = 120 + random() * 1296;
      const y = 110 + random() * 804;
      const color = colors[index % colors.length];
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}" opacity="${(0.22 + random() * 0.42).toFixed(2)}" filter="url(#blur)"/>`;
    }).join("");
  }
  if (style === "illustration") {
    return Array.from({ length: 6 }, (_, index) => {
      const x = 80 + random() * 1170;
      const y = 40 + random() * 760;
      const width = 180 + random() * 390;
      const height = 140 + random() * 300;
      const rotate = -25 + random() * 50;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="${(55 + random() * 100).toFixed(1)}" fill="${colors[index % colors.length]}" opacity="${(0.42 + random() * 0.38).toFixed(2)}" transform="rotate(${rotate.toFixed(1)} ${(x + width / 2).toFixed(1)} ${(y + height / 2).toFixed(1)})"/>`;
    }).join("");
  }
  if (style === "editorial_photo") {
    return [
      `<ellipse cx="1070" cy="410" rx="480" ry="350" fill="url(#spot)" opacity="0.88"/>`,
      `<rect x="690" y="190" width="620" height="520" rx="42" fill="none" stroke="${colors[2]}" stroke-width="18" opacity="0.5" transform="rotate(-7 1000 450)"/>`,
      `<path d="M110 760 C360 560 510 920 770 710 S1190 510 1480 680" fill="none" stroke="${colors[1]}" stroke-width="74" stroke-linecap="round" opacity="0.5"/>`,
      `<circle cx="1240" cy="220" r="112" fill="${colors[0]}" opacity="0.8"/>`,
    ].join("");
  }
  return Array.from({ length: 10 }, (_, index) => {
    const x = random() * 1536;
    const y = random() * 1024;
    const size = 80 + random() * 310;
    const sides = 3 + (index % 4);
    const points = Array.from({ length: sides }, (_, pointIndex) => {
      const angle = (Math.PI * 2 * pointIndex) / sides - Math.PI / 2;
      return `${(x + Math.cos(angle) * size).toFixed(1)},${(y + Math.sin(angle) * size).toFixed(1)}`;
    }).join(" ");
    return `<polygon points="${points}" fill="${colors[index % colors.length]}" opacity="${(0.18 + random() * 0.45).toFixed(2)}"/>`;
  }).join("");
}

export async function generateSourceArtwork(input: {
  stylePreset: ContentVisualStyle;
  specification: ContentVisualSpecification;
  primaryColor: string;
  secondaryColor: string;
}): Promise<Buffer> {
  const palette = [input.primaryColor, input.secondaryColor, ...input.specification.palette];
  const spec = { ...input.specification, palette: Array.from(new Set(palette)).slice(0, 5) };
  while (spec.palette.length < 3) spec.palette.push("#f4f1eb");
  const svg = `
    <svg width="1536" height="1024" viewBox="0 0 1536 1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${spec.palette[0]}"/>
          <stop offset="0.5" stop-color="${spec.palette[1]}"/>
          <stop offset="1" stop-color="${spec.palette[2]}"/>
        </linearGradient>
        <radialGradient id="spot"><stop offset="0" stop-color="${spec.palette[3] ?? spec.palette[0]}"/><stop offset="1" stop-color="${spec.palette[1]}" stop-opacity="0"/></radialGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="34"/></filter>
        <filter id="grain"><feTurbulence baseFrequency="0.85" numOctaves="3" seed="${spec.seed % 97}"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .08 0"/></filter>
      </defs>
      <rect width="1536" height="1024" fill="url(#background)"/>
      ${artworkShapes(input.stylePreset, spec)}
      <rect width="1536" height="1024" filter="url(#grain)" opacity="0.22"/>
      <path d="M0 930 C330 770 590 1030 930 860 C1160 745 1350 770 1536 700 L1536 1024 L0 1024 Z" fill="#000" opacity="0.12"/>
    </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 92 }).toBuffer();
}

function cropRegion(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number, focalX: number, focalY: number) {
  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  if (sourceRatio > targetRatio) {
    const width = Math.round(sourceHeight * targetRatio);
    return {
      left: Math.round((sourceWidth - width) * focalX / 100),
      top: 0,
      width,
      height: sourceHeight,
    };
  }
  const height = Math.round(sourceWidth / targetRatio);
  return {
    left: 0,
    top: Math.round((sourceHeight - height) * focalY / 100),
    width: sourceWidth,
    height,
  };
}

function escapePango(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function safeSvgColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
}

function glyphWidth(value: string): number {
  if (/\s/u.test(value)) return 0.36;
  return /^[\u0000-\u007f]$/u.test(value) ? 0.58 : 1;
}

function wrapSvgText(value: string, maxUnits: number, maxLines = 3): string[] {
  const characters = Array.from(value.replace(/\s+/gu, " ").trim());
  if (characters.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  let units = 0;
  let consumed = 0;
  for (const character of characters) {
    const nextUnits = glyphWidth(character);
    if (line && units + nextUnits > maxUnits) {
      lines.push(line.trimEnd());
      if (lines.length === maxLines) break;
      line = character.trimStart();
      units = line ? nextUnits : 0;
    } else {
      line += character;
      units += nextUnits;
    }
    consumed += 1;
  }
  if (lines.length < maxLines && line.trim()) lines.push(line.trim());
  if (consumed < characters.length && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].replace(/[\s.…]+$/gu, "")}…`;
  }
  return lines;
}

function fontFile(): string {
  return path.join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "noto-sans-kr",
    "files",
    "noto-sans-kr-korean-700-normal.woff",
  );
}

async function textLayer(text: string, width: number, height: number, fontSize: number, color: string): Promise<Buffer> {
  return sharp({
    text: {
      text: `<span foreground="${color}" font_size="${fontSize * 1024}"><b>${escapePango(text)}</b></span>`,
      font: "Noto Sans KR",
      fontfile: fontFile(),
      width,
      height,
      align: "left",
      rgba: true,
      wrap: "word-char",
      spacing: Math.round(fontSize * 0.22),
    },
  }).png().toBuffer();
}

async function jpegWithinLimit(image: ReturnType<typeof sharp>): Promise<Buffer> {
  const base = image.clone().flatten({ background: "#ffffff" }).toColourspace("srgb");
  for (const quality of [90, 84, 78, 70]) {
    const bytes = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (bytes.length <= MAX_VARIANT_BYTES || quality === 70) return bytes;
  }
  throw new Error("JPEG 렌더링에 실패했습니다.");
}

async function renderRasterVariant(input: {
  source: Buffer;
  width: number;
  height: number;
  presentation: Presentation;
  brand: Brand;
}): Promise<Buffer> {
  const metadata = await sharp(input.source).metadata();
  const sourceWidth = metadata.width ?? VISUAL_SOURCE_SIZE.width;
  const sourceHeight = metadata.height ?? VISUAL_SOURCE_SIZE.height;
  const crop = cropRegion(
    sourceWidth,
    sourceHeight,
    input.width,
    input.height,
    input.presentation.focalX,
    input.presentation.focalY,
  );
  const base = sharp(input.source)
    .extract(crop)
    .resize(input.width, input.height, { fit: "fill" });
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  if (input.presentation.showTitle) {
    const titleAtTop = input.presentation.titlePosition === "top_left";
    const titleTop = titleAtTop ? 0.1 : 0.58;
    const bandCount = 32;
    const bandHeight = Math.ceil(input.height / bandCount) + 1;
    const shadeBands = Array.from({ length: bandCount }, (_, index) => {
      const progress = index / (bandCount - 1);
      const opacity = titleAtTop
        ? Math.max(0, 0.82 * (1 - progress / 0.75))
        : Math.max(0, 0.82 * ((progress - 0.25) / 0.75));
      return `<rect x="0" y="${Math.floor(index * input.height / bandCount)}" width="${input.width}" height="${bandHeight}" fill="#000" fill-opacity="${opacity.toFixed(3)}"/>`;
    }).join("");
    const overlay = Buffer.from(`
      <svg width="${input.width}" height="${input.height}" xmlns="http://www.w3.org/2000/svg">
        ${shadeBands}
        <rect x="${Math.round(input.width * 0.055)}" y="${Math.round(input.height * titleTop)}" width="${Math.round(input.width * 0.011)}" height="${Math.round(input.height * 0.3)}" rx="6" fill="${input.brand.primaryColor}"/>
      </svg>`);
    composites.push({ input: overlay, left: 0, top: 0 });
    const titleWidth = Math.round(input.width * 0.78);
    const titleHeight = Math.round(input.height * 0.28);
    const fontSize = input.width >= 1250 ? 46 : 42;
    composites.push({
      input: await textLayer(input.presentation.displayTitle, titleWidth, titleHeight, fontSize, "#ffffff"),
      left: Math.round(input.width * 0.085),
      top: Math.round(input.height * (titleAtTop ? 0.12 : 0.6)),
    });
  }
  if (input.presentation.showLogo) {
    const titleAtTop = input.presentation.showTitle && input.presentation.titlePosition === "top_left";
    const top = Math.round(input.height * (titleAtTop ? 0.84 : 0.065));
    const left = Math.round(input.width * 0.055);
    if (input.brand.logo) {
      const logoHeight = Math.round(input.height * 0.085);
      const logo = await sharp(input.brand.logo).resize({ height: logoHeight, withoutEnlargement: true }).png().toBuffer();
      composites.push({ input: logo, left, top });
    } else {
      composites.push({
        input: await textLayer(input.brand.brandName, Math.round(input.width * 0.34), Math.round(input.height * 0.09), 20, "#ffffff"),
        left,
        top,
      });
    }
  }
  return jpegWithinLimit(base.composite(composites));
}

export async function renderSvgVariant(input: {
  source: Buffer;
  width: number;
  height: number;
  presentation: Presentation;
  brand: Brand;
}): Promise<Buffer> {
  const metadata = await sharp(input.source).metadata();
  const sourceWidth = metadata.width ?? VISUAL_SOURCE_SIZE.width;
  const sourceHeight = metadata.height ?? VISUAL_SOURCE_SIZE.height;
  const crop = cropRegion(
    sourceWidth,
    sourceHeight,
    input.width,
    input.height,
    input.presentation.focalX,
    input.presentation.focalY,
  );
  const primaryColor = safeSvgColor(input.brand.primaryColor, "#ff5a1f");
  const titleFontSize = input.width >= 1250 ? 48 : 44;
  const titleWidth = input.width * 0.78;
  const titleLines = wrapSvgText(
    input.presentation.displayTitle,
    titleWidth / titleFontSize,
  );
  const titleAtTop = input.presentation.titlePosition === "top_left";
  const titleX = Math.round(input.width * 0.085);
  const titleY = Math.round(input.height * (titleAtTop ? 0.16 : 0.62));
  const titleLineHeight = Math.round(titleFontSize * 1.2);
  const titleMarkup = input.presentation.showTitle
    ? `<g fill="#fff" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" font-size="${titleFontSize}" font-weight="700">${titleLines
      .map((line, index) => `<text x="${titleX}" y="${titleY + titleLineHeight * index}">${escapeXml(line)}</text>`)
      .join("")}</g>`
    : "";

  let brandMarkup = "";
  if (input.presentation.showLogo) {
    const top = Math.round(input.height * (input.presentation.showTitle && titleAtTop ? 0.84 : 0.065));
    const left = Math.round(input.width * 0.055);
    if (input.brand.logo) {
      const logoHeight = Math.round(input.height * 0.085);
      const logo = await sharp(input.brand.logo)
        .resize({ height: logoHeight, withoutEnlargement: true })
        .png()
        .toBuffer({ resolveWithObject: true });
      brandMarkup = `<image x="${left}" y="${top}" width="${logo.info.width}" height="${logo.info.height}" href="data:image/png;base64,${logo.data.toString("base64")}"/>`;
    } else {
      brandMarkup = `<text x="${left}" y="${top + 22}" fill="#fff" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" font-size="22" font-weight="700">${escapeXml(input.brand.brandName)}</text>`;
    }
  }

  for (const quality of [88, 80, 72, 64, 56]) {
    const background = await sharp(input.source)
      .extract(crop)
      .resize(input.width, input.height, { fit: "fill" })
      .toColourspace("srgb")
      .webp({ quality })
      .toBuffer();
    const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(input.presentation.displayTitle || input.brand.brandName)}</title>
  <desc id="description">SEMForge 콘텐츠 썸네일</desc>
  <image width="${input.width}" height="${input.height}" href="data:image/webp;base64,${background.toString("base64")}" preserveAspectRatio="none"/>
  ${input.presentation.showTitle ? `<defs><linearGradient id="shade" x1="0%" y1="0%" x2="0%" y2="100%">${titleAtTop ? '<stop offset="0%" stop-color="#000" stop-opacity="0.82"/><stop offset="75%" stop-color="#000" stop-opacity="0"/>' : '<stop offset="25%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.82"/>'}</linearGradient></defs><rect width="${input.width}" height="${input.height}" fill="url(#shade)"/><rect x="${Math.round(input.width * 0.055)}" y="${Math.round(input.height * (titleAtTop ? 0.1 : 0.58))}" width="${Math.round(input.width * 0.011)}" height="${Math.round(input.height * 0.3)}" rx="6" fill="${primaryColor}"/>` : ""}
  ${brandMarkup}
  ${titleMarkup}
</svg>`);
    if (svg.length <= MAX_VARIANT_BYTES) return svg;
  }
  throw new Error("SVG 렌더링 결과가 파일 크기 제한을 초과했습니다.");
}

export async function renderVisualVariants(input: {
  source: Buffer;
  presentation: Presentation;
  brand: Brand;
}): Promise<{ thumbnail: Buffer; openGraph: Buffer }> {
  const [thumbnail, openGraph] = await Promise.all([
    renderSvgVariant({ ...input, ...VISUAL_VARIANTS.thumbnail }),
    renderSvgVariant({ ...input, ...VISUAL_VARIANTS.open_graph }),
  ]);
  return { thumbnail, openGraph };
}

export async function renderProductionImage(input: {
  source: Buffer;
  preset: keyof typeof PRODUCTION_IMAGE_PRESETS;
  presentation: Presentation;
  brand: Brand;
}): Promise<{ bytes: Buffer; width: number; height: number }> {
  const size = PRODUCTION_IMAGE_PRESETS[input.preset];
  return {
    bytes: await renderRasterVariant({ ...input, ...size }),
    ...size,
  };
}

export async function renderVideoKeyframe(input: {
  source: Buffer;
  aspectRatio: keyof typeof VIDEO_KEYFRAME_SIZES;
  focalX?: number;
  focalY?: number;
}): Promise<{ bytes: Buffer; width: number; height: number }> {
  const size = VIDEO_KEYFRAME_SIZES[input.aspectRatio];
  const metadata = await sharp(input.source).metadata();
  const sourceWidth = metadata.width ?? VISUAL_SOURCE_SIZE.width;
  const sourceHeight = metadata.height ?? VISUAL_SOURCE_SIZE.height;
  const crop = cropRegion(
    sourceWidth,
    sourceHeight,
    size.width,
    size.height,
    input.focalX ?? 50,
    input.focalY ?? 50,
  );
  const bytes = await sharp(input.source)
    .extract(crop)
    .resize(size.width, size.height, { fit: "fill" })
    .toColourspace("srgb")
    .webp({ quality: 90 })
    .toBuffer();
  return { bytes, ...size };
}

export async function normalizeBrandLogo(input: Buffer): Promise<{ bytes: Buffer; width: number; height: number }> {
  const image = sharp(input, { animated: false, limitInputPixels: 16_777_216 });
  const metadata = await image.metadata();
  if (!(["png", "webp"] as Array<typeof metadata.format>).includes(metadata.format)) {
    throw new Error("PNG 또는 WebP 로고만 사용할 수 있습니다.");
  }
  if (!metadata.width || !metadata.height) throw new Error("로고 크기를 확인할 수 없습니다.");
  const bytes = await image.resize({ width: 1024, height: 512, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const normalized = await sharp(bytes).metadata();
  return { bytes, width: normalized.width ?? metadata.width, height: normalized.height ?? metadata.height };
}
