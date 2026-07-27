#!/usr/bin/env node
/**
 * 중립 플레이스홀더 에셋 생성기 (타사 상표 로고 대체용).
 * 가상의 브랜드 워드마크 SVG와 제품 UI 목업 이미지를 생성한다.
 */
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const brands = [
  "Northwind", "Acme", "Globex", "Initech", "Umbrella", "Hooli",
  "Contoso", "Vandelay", "Massive", "Stark", "Wayne", "Soylent",
];

function wordmark(name) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 60" role="img" aria-label="${name}">
  <rect x="4" y="18" width="24" height="24" rx="6" fill="#6c6e79"/>
  <text x="40" y="38" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700" fill="#6c6e79">${name}</text>
</svg>`;
}

// 제품 UI 목업 (앱 스크린샷 대체) — 간단한 대시보드 실루엣
function mockup(label, accent = "#c190ff") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img" aria-label="${label} preview">
  <rect width="800" height="500" rx="12" fill="#ffffff"/>
  <rect width="800" height="56" rx="12" fill="#f3f6f6"/>
  <circle cx="28" cy="28" r="6" fill="#d1d2d5"/><circle cx="48" cy="28" r="6" fill="#d1d2d5"/><circle cx="68" cy="28" r="6" fill="#d1d2d5"/>
  <rect x="24" y="88" width="220" height="24" rx="6" fill="#181e15"/>
  <rect x="24" y="128" width="140" height="14" rx="4" fill="#d1d2d5"/>
  <rect x="24" y="176" width="344" height="140" rx="10" fill="${accent}" opacity="0.18"/>
  <rect x="392" y="176" width="384" height="140" rx="10" fill="#dceeeb"/>
  <polyline points="40,290 100,250 160,270 220,210 300,240 360,200" fill="none" stroke="${accent}" stroke-width="4"/>
  <rect x="24" y="340" width="752" height="18" rx="5" fill="#f0f1f2"/>
  <rect x="24" y="372" width="752" height="18" rx="5" fill="#f0f1f2"/>
  <rect x="24" y="404" width="620" height="18" rx="5" fill="#f0f1f2"/>
  <rect x="24" y="436" width="500" height="18" rx="5" fill="#f0f1f2"/>
</svg>`;
}

async function main() {
  // 기존 실제 브랜드 로고 제거(상표 재배포 방지)
  await rm(path.join(ROOT, "public/logos"), { recursive: true, force: true });
  await mkdir(path.join(ROOT, "public/logos"), { recursive: true });
  for (const b of brands) {
    await writeFile(path.join(ROOT, `public/logos/${b}.svg`), wordmark(b));
  }

  // 제품 목업 (실제 다운로드 스크린샷 대체)
  const mockups = [
    ["semrush_one_m", "#c190ff"], ["seo_m", "#18f0bf"], ["ai_visibility_m", "#89ff75"],
    ["traffic_m", "#008ff8"], ["content_m", "#c190ff"], ["local_m", "#18f0bf"],
    ["atool_m", "#ff642d"], ["ai_pr_m", "#8649e1"], ["social_m", "#008ff8"],
  ];
  await mkdir(path.join(ROOT, "public/toolkits"), { recursive: true });
  for (const [name, accent] of mockups) {
    await writeFile(path.join(ROOT, `public/toolkits/${name}.svg`), mockup(name, accent));
  }

  // 홈 프로모/리소스 목업
  await mkdir(path.join(ROOT, "public/images/resources"), { recursive: true });
  for (const [name, accent] of [["sem_one", "#c190ff"], ["sem_mcp", "#18f0bf"], ["enterprise_poster", "#008ff8"], ["plg_toolkits", "#c190ff"]]) {
    await writeFile(path.join(ROOT, `public/images/${name}.svg`), mockup(name, accent));
  }
  // 엔터프라이즈 다크 커버 배경
  await writeFile(
    path.join(ROOT, "public/images/enterprise_bg.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#181e15"/><stop offset="1" stop-color="#2a2f27"/></linearGradient></defs><rect width="1200" height="600" fill="url(#g)"/><circle cx="980" cy="140" r="220" fill="#c190ff" opacity="0.16"/><circle cx="1080" cy="440" r="160" fill="#18f0bf" opacity="0.12"/></svg>`
  );
  const resCards = ["adobe_brand_visibility", "ai_search_os", "spotlight", "direct_access", "ai_visibility_share_of_voice", "free_webinars", "semrush_lovable_anouncement", "adobe_semrush_announcement", "adobe_semrush_announcement_faq"];
  for (const name of resCards) {
    await writeFile(path.join(ROOT, `public/images/resources/${name}.svg`), mockup(name, "#c190ff"));
  }

  // 후기 아바타/로고 플레이스홀더
  await mkdir(path.join(ROOT, "public/images/testimonials"), { recursive: true });
  await writeFile(path.join(ROOT, "public/images/testimonials/brand.svg"), wordmark("Contoso"));
  await writeFile(
    path.join(ROOT, "public/images/testimonials/avatar.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="#dceeeb"/><circle cx="48" cy="38" r="18" fill="#6c6e79"/><path d="M16 88a32 32 0 0 1 64 0z" fill="#6c6e79"/></svg>`
  );

  console.log(`placeholders: ${brands.length} logos, ${mockups.length} toolkits, ${resCards.length} resource cards`);
}

main();
