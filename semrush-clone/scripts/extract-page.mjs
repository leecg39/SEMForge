#!/usr/bin/env node
/**
 * 공개 페이지 구조 추출기.
 * 사용법: node scripts/extract-page.mjs <path> [outName]
 * 예: node scripts/extract-page.mjs /features/keyword-research/ FTR-008
 * 결과: docs/research/pages/<outName>.json 에 히어로/헤딩/섹션/FAQ/이미지 요약 저장.
 *
 * 마케팅 카피의 "구조"(제목/소제목/CTA 라벨/FAQ 질문)를 파악해
 * 템플릿 인스턴스 데이터 초안을 만드는 용도. 픽셀 스타일이 아닌 정보 구조 추출.
 */
import { parse } from "node-html-parser";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

async function extract(pathname, outName) {
  const url = `https://www.semrush.com${pathname}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://www.semrush.com/" } });
  const status = res.status;
  const html = await res.text();
  const root = parse(html, { blockTextElements: { script: false, style: false } });

  const meta = {
    status,
    url,
    title: clean(root.querySelector("title")?.text),
    description: root.querySelector('meta[name="description"]')?.getAttribute("content") || "",
    ogTitle: root.querySelector('meta[property="og:title"]')?.getAttribute("content") || "",
    canonical: root.querySelector('link[rel="canonical"]')?.getAttribute("href") || "",
  };

  const h1 = clean(root.querySelector("h1")?.text);
  const headings = root
    .querySelectorAll("h2, h3")
    .map((h) => ({ tag: h.tagName?.toLowerCase(), text: clean(h.text) }))
    .filter((h) => h.text && h.text.length < 160)
    .slice(0, 60);

  // CTA 버튼/링크 라벨
  const ctas = [
    ...new Set(
      root
        .querySelectorAll("a, button")
        .map((a) => clean(a.text))
        .filter((t) => t && t.length < 40 && /free|trial|demo|get|start|try|sign|explore|learn|contact|book|see|view/i.test(t))
    ),
  ].slice(0, 20);

  // FAQ: dt/summary/aria 혹은 "FAQ" 인접 질문 패턴
  const faqCandidates = [
    ...root.querySelectorAll('[class*="faq" i] [class*="question" i], [class*="accordion" i] button, summary, dt'),
  ]
    .map((e) => clean(e.text))
    .filter((t) => t.endsWith("?") || (t.length > 12 && t.length < 160))
    .slice(0, 15);

  // 이미지 (제품 UI 스크린샷 위주, 추적픽셀 제외)
  const images = [
    ...new Set(
      root
        .querySelectorAll("img")
        .map((im) => im.getAttribute("src") || im.getAttribute("data-src") || "")
        .filter((s) => s && s.includes("/static/") && !/pixel|1x1|\.gif/.test(s))
    ),
  ].slice(0, 30);

  // 본문 단락 샘플 (섹션 설명문)
  const paragraphs = root
    .querySelectorAll("p")
    .map((p) => clean(p.text))
    .filter((t) => t.length > 40 && t.length < 400)
    .slice(0, 25);

  const out = { meta, h1, headings, ctas, faqCandidates, images, paragraphs };
  const dest = path.join(ROOT, "docs/research/pages", `${outName}.json`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(out, null, 2));
  console.log(`${outName} status=${status} h1="${h1?.slice(0, 50)}" headings=${headings.length} faq=${faqCandidates.length} imgs=${images.length}`);
  return out;
}

const [, , pathname, outName] = process.argv;
if (!pathname) {
  console.error("usage: node scripts/extract-page.mjs <path> [outName]");
  process.exit(1);
}
extract(pathname, outName || pathname.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")).catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
