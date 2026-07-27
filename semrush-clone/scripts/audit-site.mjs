/**
 * 사이트 상태 진단 스크립트.
 *
 * 실행: node scripts/audit-site.mjs [baseUrl]
 *
 * 검사 항목
 *  1. 모든 라우트의 HTTP 상태 (200 이외 전부 보고)
 *  2. 페이지 HTML 안의 내부 링크가 실제로 열리는지 (깨진 링크)
 *  3. 참조하는 정적 자산(img/src, srcset, poster, video source)의 존재 여부
 *  4. Next.js 오류 마커(예: Application error, 500) 포함 여부
 *
 * 결과는 콘솔 요약 + docs/research/AUDIT_REPORT.json 으로 저장한다.
 */

import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:4320";
const APP_DIR = path.join(process.cwd(), "src", "app");

/** src/app 의 page.tsx 위치에서 정적 라우트 경로를 만든다. 동적 세그먼트는 대표값으로 치환. */
const DYNAMIC_SAMPLES = {
  "[slug]": {
    "/features": "ai-visibility",
    "/solutions": "agencies",
    "/pricing": "seo",
    "/free-tools": "serp-checker",
    "/blog": "xml-sitemap",
    "/vs": "semrush-vs-ahrefs",
    "/apps": "callrail",
    "/apps/collection": "seo",
    "/ai-seo": "overview",
    "/analytics/traffic": "traffic-overview",
  },
  "[...slug]": {
    "/lp": "affiliate-program/en",
    "/trending-websites": "global/all",
  },
  "[...seg]": { "/analytics": "overview" },
  "[host]": { "/ext": "developer.semrush.com" },
  "[action]": { "/content/articles": "create" },
};

function collectRoutes(dir, prefix = "") {
  const routes = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    // 라우트 그룹은 URL 에 반영되지 않는다
    const segment = name.startsWith("(") && name.endsWith(")") ? "" : `/${name}`;
    const nextPrefix = `${prefix}${segment}`;
    const child = path.join(dir, name);

    if (fs.existsSync(path.join(child, "page.tsx"))) {
      routes.push(nextPrefix || "/");
    }
    routes.push(...collectRoutes(child, nextPrefix));
  }
  return routes;
}

function resolveDynamic(route) {
  for (const [token, map] of Object.entries(DYNAMIC_SAMPLES)) {
    if (!route.includes(token)) continue;
    const parent = route.slice(0, route.indexOf(`/${token}`));
    const sample = map[parent];
    if (!sample) return null;
    route = route.replace(`${token}`, sample);
  }
  return route.includes("[") ? null : route;
}

function normalize(route) {
  if (route === "/") return "/";
  return route.endsWith("/") ? route : `${route}/`;
}

async function head(url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    const body = response.headers.get("content-type")?.includes("text/html")
      ? await response.text()
      : "";
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: "", error: String(error) };
  }
}

/**
 * Next.js 는 RSC 플라이트 페이로드에 내장 404/500 바운더리 템플릿을 항상 포함시킨다.
 * 따라서 <script> 내용을 제거한 렌더 결과에서만 오류 문구를 찾아야 오탐이 없다.
 */
function hasRenderedError(html) {
  const visible = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  return /Application error|Internal Server Error|This page could not be found/i.test(visible);
}

function extractLinks(html) {
  const links = new Set();
  for (const match of html.matchAll(/href="(\/[^"#?]*)"/g)) links.add(match[1]);
  return Array.from(links);
}

function extractAssets(html) {
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|poster)="(\/[^"?]+\.[a-z0-9]{2,5})"/gi)) {
    assets.add(match[1]);
  }
  for (const match of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const candidate of match[1].split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url.startsWith("/") && !url.startsWith("/_next/image")) assets.add(url);
    }
  }
  return Array.from(assets);
}

async function main() {
  const rawRoutes = Array.from(new Set(collectRoutes(APP_DIR)));
  const routes = Array.from(
    new Set(
      rawRoutes
        .map(resolveDynamic)
        .filter(Boolean)
        .map(normalize)
        // CRUD 앱은 인증이 필요해 별도 스크립트(verify-crud)에서 검사한다
        .filter((route) => !route.startsWith("/app/") && !route.startsWith("/api/"))
    )
  ).sort();

  console.log(`진단 대상 ${routes.length}개 라우트 · ${BASE}\n`);

  const pageProblems = [];
  const linkTargets = new Map();
  const assetTargets = new Map();

  for (const route of routes) {
    const { status, body, error } = await head(`${BASE}${route}`);
    const hasErrorMarker = hasRenderedError(body);

    if (status !== 200 || hasErrorMarker) {
      pageProblems.push({ route, status, hasErrorMarker, error });
      console.log(`  [${status}] ${route}${hasErrorMarker ? " (오류 마커 포함)" : ""}`);
    }

    for (const link of extractLinks(body)) {
      if (!linkTargets.has(link)) linkTargets.set(link, new Set());
      linkTargets.get(link).add(route);
    }
    for (const asset of extractAssets(body)) {
      if (!assetTargets.has(asset)) assetTargets.set(asset, new Set());
      assetTargets.get(asset).add(route);
    }
  }

  console.log(`\n페이지 오류: ${pageProblems.length}건`);

  // 내부 링크 검사
  console.log(`\n내부 링크 ${linkTargets.size}개 검사 중…`);
  const brokenLinks = [];
  for (const [link, sources] of linkTargets) {
    const target = normalize(link);
    const { status } = await head(`${BASE}${target}`);
    if (status !== 200) {
      brokenLinks.push({ link, status, sources: Array.from(sources).slice(0, 4) });
    }
  }
  console.log(`깨진 링크: ${brokenLinks.length}건`);
  for (const item of brokenLinks.slice(0, 30)) {
    console.log(`  [${item.status}] ${item.link}  ← ${item.sources.join(", ")}`);
  }

  // 정적 자산 검사
  console.log(`\n정적 자산 ${assetTargets.size}개 검사 중…`);
  const missingAssets = [];
  for (const [asset, sources] of assetTargets) {
    const { status } = await head(`${BASE}${asset}`);
    if (status !== 200) {
      missingAssets.push({ asset, status, sources: Array.from(sources).slice(0, 4) });
    }
  }
  console.log(`누락 자산: ${missingAssets.length}건`);
  for (const item of missingAssets.slice(0, 30)) {
    console.log(`  [${item.status}] ${item.asset}  ← ${item.sources.join(", ")}`);
  }

  const report = {
    base: BASE,
    checkedAt: new Date().toISOString(),
    routeCount: routes.length,
    pageProblems,
    brokenLinks,
    missingAssets,
  };
  const outPath = path.join(process.cwd(), "docs", "research", "AUDIT_REPORT.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n리포트 저장: ${outPath}`);
  console.log(
    `\n요약: 페이지 오류 ${pageProblems.length} · 깨진 링크 ${brokenLinks.length} · 누락 자산 ${missingAssets.length}`
  );
}

main().catch((error) => {
  console.error("진단 실패:", error);
  process.exit(1);
});
