#!/usr/bin/env node
/**
 * Semrush 정적 에셋 다운로더.
 * 사용법: node scripts/download-assets.mjs [manifest.json]
 * manifest 형식: [{ "url": "https://...", "dest": "public/..." }]
 * 인자가 없으면 기본 전역 에셋(폰트/파비콘/로고/패턴)을 받는다.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const DEFAULT_MANIFEST = [
  // 폰트 (variable = 전체 웨이트 커버)
  { url: "https://www.semrush.com/__static__/fonts/lazzer/v2/variable.woff2", dest: "public/fonts/lazzer/variable.woff2" },
  { url: "https://www.semrush.com/__static__/fonts/lazzer/v2/regular.woff2", dest: "public/fonts/lazzer/regular.woff2" },
  { url: "https://www.semrush.com/__static__/fonts/lazzer/v2/medium.woff2", dest: "public/fonts/lazzer/medium.woff2" },
  { url: "https://www.semrush.com/__static__/fonts/lazzer/v2/semibold.woff2", dest: "public/fonts/lazzer/semibold.woff2" },
  { url: "https://www.semrush.com/__static__/fonts/lazzer/v2/bold.woff2", dest: "public/fonts/lazzer/bold.woff2" },
  { url: "https://www.semrush.com/__static__/fonts/factor_a/v2/variable.woff2", dest: "public/fonts/factor_a/variable.woff2" },
  // 파비콘/메타
  { url: "https://www.semrush.com/__static__/favicon.d8fbaa3a030a.ico", dest: "public/seo/favicon.ico" },
  { url: "https://www.semrush.com/__static__/favicon.37cab19e6995.svg", dest: "public/seo/favicon.svg" },
  { url: "https://www.semrush.com/__static__/apple-touch-icon.fe16ae843d17.png", dest: "public/seo/apple-touch-icon.png" },
  // 고객 로고 월
  ...["Shopify", "Decathlon", "Booking", "P&G", "Samsung", "FedEx", "Amazon", "General_Electric", "Airbnb", "Netflix", "TikTok", "Dropbox"].map(
    (n) => ({ url: `https://www.semrush.com/static/logos/${n}_logo.svg`, dest: `public/logos/${n.replace("&", "and")}_logo.svg` })
  ),
  // 홈 툴킷 프로모 이미지
  ...["semrush_one", "seo", "ai_visibility", "traffic", "content", "local", "atool", "ai_pr", "social"].map((n) => ({
    url: `https://www.semrush.com/static/toolkits/${n}_m.webp`,
    dest: `public/toolkits/${n}_m.webp`,
  })),
  // 배경 패턴
  { url: "https://www.semrush.com/static/images/pattern-hero.7635a3ff0d4dd3cbe43a.svg", dest: "public/images/pattern-hero.svg" },
  { url: "https://www.semrush.com/static/images/pattern-toolkit-card.daa039e1b121bb762944.svg", dest: "public/images/pattern-toolkit-card.svg" },
  { url: "https://www.semrush.com/static/images/pattern-ai-vis-index.c1384cdc6eeda6e0b83b.svg", dest: "public/images/pattern-ai-vis-index.svg" },
  { url: "https://www.semrush.com/static/images/pattern-testimonials-card.be52eae7e23c9941a271.svg", dest: "public/images/pattern-testimonials-card.svg" },
  { url: "https://www.semrush.com/static/images/enterprise_bg.b2724f71505ad940f645.webp", dest: "public/images/enterprise_bg.webp" },
  // 홈 영상/포스터
  { url: "https://www.semrush.com/static/videos/plg_toolkits_with_pr.mp4", dest: "public/videos/plg_toolkits_with_pr.mp4" },
  { url: "https://www.semrush.com/static/plg_toolkits.webp", dest: "public/images/plg_toolkits.webp" },
  { url: "https://www.semrush.com/static/sem_one.webp", dest: "public/images/sem_one.webp" },
  { url: "https://www.semrush.com/static/sem_mcp.webp", dest: "public/images/sem_mcp.webp" },
  { url: "https://www.semrush.com/static/enterprise_poster.webp", dest: "public/images/enterprise_poster.webp" },
  // 홈 리소스 카드
  ...["adobe_brand_visibility", "ai_search_os", "spotlight", "direct_access", "ai_visibility_share_of_voice", "free_webinars"].map((n) => ({
    url: `https://www.semrush.com/static/resources/${n}.webp`,
    dest: `public/images/resources/${n}.webp`,
  })),
  ...["semrush_lovable_anouncement", "adobe_semrush_announcement", "adobe_semrush_announcement_faq"].map((n) => ({
    url: `https://www.semrush.com/static/resources/${n}.svg`,
    dest: `public/images/resources/${n}.svg`,
  })),
  { url: "https://www.semrush.com/static/ai_visibility_index.svg", dest: "public/images/ai_visibility_index.svg" },
  { url: "https://www.semrush.com/static//testimonials/Zoominfo.svg", dest: "public/images/testimonials/Zoominfo.svg" },
  { url: "https://www.semrush.com/static//testimonials/James_Roth.png", dest: "public/images/testimonials/James_Roth.png" },
];

async function download(item) {
  const dest = path.join(ROOT, item.dest);
  if (existsSync(dest)) return { ...item, status: "cached" };
  try {
    const res = await fetch(item.url, { headers: { "User-Agent": UA, Referer: "https://www.semrush.com/" } });
    if (!res.ok) return { ...item, status: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    return { ...item, status: "ok", bytes: buf.length };
  } catch (e) {
    return { ...item, status: `ERR ${e.message}` };
  }
}

async function main() {
  const manifestPath = process.argv[2];
  const manifest = manifestPath ? JSON.parse(await readFile(manifestPath, "utf8")) : DEFAULT_MANIFEST;
  const results = [];
  for (let i = 0; i < manifest.length; i += 4) {
    const batch = manifest.slice(i, i + 4);
    results.push(...(await Promise.all(batch.map(download))));
  }
  const failed = results.filter((r) => r.status !== "ok" && r.status !== "cached");
  console.log(`total=${results.length} ok=${results.filter((r) => r.status === "ok").length} cached=${results.filter((r) => r.status === "cached").length} failed=${failed.length}`);
  for (const f of failed) console.log(`FAIL ${f.status} ${f.url}`);
}

main();
