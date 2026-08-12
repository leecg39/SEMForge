// @TASK P1-R1-T1 - 레거시 페이지·API·서비스·자산 완전 삭제
// @SPEC docs/planning/06-tasks.md#p1-r1-t1--레거시-페이지api서비스자산-완전-삭제
// @TEST src/contracts/product-surface.contract.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const projectRoot = process.cwd();
const appRoot = path.join(projectRoot, "src", "app");

const allowedPages = new Set([
  "/",
  "/login",
  "/invite/[token]",
  "/forgot-password",
  "/reset-password/[token]",
  "/legal/privacy",
  "/legal/terms",
  "/app",
  "/app/sites",
  "/app/sites/[siteId]",
  "/app/reports",
  "/app/reports/[reportId]",
  "/app/billing",
  "/app/settings",
]);

const allowedExactRoutes = new Set([
  "/api/v1/auth/invites/accept",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/password/forgot",
  "/api/v1/auth/password/reset",
  "/api/v1/auth/session",
  "/api/v1/billing/authorize",
  "/api/v1/billing/cancel",
  "/api/v1/billing/checkout",
  "/api/v1/billing/payment-method",
  "/api/v1/billing/retry",
  "/api/v1/billing/subscription",
  "/api/v1/integrations/gsc/bindings",
  "/api/v1/integrations/gsc/callback",
  "/api/v1/integrations/gsc/connect",
  "/api/v1/integrations/gsc/connections",
  "/api/v1/integrations/gsc/connections/[connectionId]",
  "/api/v1/integrations/gsc/connections/[connectionId]/properties",
  "/api/v1/insights/naver",
  "/api/v1/reports",
  "/api/v1/reports/[reportId]",
  "/api/v1/reports/[reportId]/pdf",
  "/api/v1/reports/branding",
  "/api/v1/sites",
  "/api/v1/sites/[siteId]",
  "/api/v1/tracking",
  "/api/v1/tracking/[trackingId]",
  "/api/v1/visibility/aio",
  "/api/v1/webhooks/toss",
  "/health/live",
  "/health/ready",
]);

const forbiddenLegacySegments = new Set([
  "(app)",
  "(public)",
  "signup",
  "signin",
  "analytics",
  "advertising",
  "ai-search",
  "ai-seo",
  "ai-visibility",
  "apps",
  "backlink-audit",
  "backlinks",
  "backlink_audit",
  "chatmock",
  "content",
  "crud",
  "domain-analysis",
  "firecrawl",
  "free-tools",
  "gbp",
  "home",
  "local",
  "loop",
  "maprank",
  "marketing",
  "my_reports",
  "naver-keywords",
  "onpage",
  "position-tracking",
  "pr-toolkit",
  "psi",
  "seo-dashboard",
  "seo-projects",
  "seo-tools",
  "siteaudit",
  "social",
  "traffic",
]);

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(absolute);
    return entry.isFile() ? [absolute] : [];
  });
}

function relativeProjectPath(file: string): string {
  return path.relative(projectRoot, file).split(path.sep).join("/");
}

function routePath(file: string): string {
  const segments = path
    .relative(appRoot, path.dirname(file))
    .split(path.sep)
    .filter((segment) => segment && !/^\(.+\)$/.test(segment) && !segment.startsWith("@"));
  return `/${segments.join("/")}`;
}

test("발견된 App Router 페이지는 제품 페이지 허용 목록 안에만 존재한다", () => {
  const pageFiles = walkFiles(appRoot).filter((file) => /^page\.(?:ts|tsx|js|jsx)$/.test(path.basename(file)));
  const discovered = pageFiles.map((file) => ({ file: relativeProjectPath(file), route: routePath(file) }));
  const duplicateRoutes = discovered
    .map(({ route }) => route)
    .filter((route, index, routes) => routes.indexOf(route) !== index);
  const discoveredRoutes = discovered.map(({ route }) => route).toSorted();
  const expectedRoutes = [...allowedPages].toSorted();

  assert.deepEqual(duplicateRoutes, [], `중복 페이지 경로: ${duplicateRoutes.join(", ")}`);
  assert.deepEqual(
    discoveredRoutes,
    expectedRoutes,
    `페이지 목록은 14개 제품 계약과 정확히 일치해야 합니다.\n${JSON.stringify(discovered, null, 2)}`,
  );
});

test("발견된 Route Handler는 존재하는 제품 API exact set과 정확히 일치한다", () => {
  const routeFiles = walkFiles(appRoot).filter((file) => /^route\.(?:ts|tsx|js|jsx)$/.test(path.basename(file)));
  const discovered = routeFiles.map((file) => ({ file: relativeProjectPath(file), route: routePath(file) }));
  const duplicateRoutes = discovered
    .map(({ route }) => route)
    .filter((route, index, routes) => routes.indexOf(route) !== index);

  assert.deepEqual(duplicateRoutes, [], `중복 API 경로: ${duplicateRoutes.join(", ")}`);
  assert.deepEqual(
    discovered.map(({ route }) => route).toSorted(),
    [...allowedExactRoutes].toSorted(),
    `API 경로 집합이 제품 계약과 달라졌습니다.\n${JSON.stringify(discovered, null, 2)}`,
  );
});

test("제품 소스에는 레거시 기능 경로와 SQLite·복제 제품 흔적이 없다", () => {
  const sourceRoots = [
    "src/app",
    "src/components",
    "src/server",
    "src/lib",
    "src/i18n",
    "src/types",
  ];
  const sourceFiles = sourceRoots
    .flatMap((root) => walkFiles(path.join(projectRoot, root)))
    .filter((file) => /\.(?:ts|tsx|js|jsx|css|json)$/.test(file));

  const forbiddenPaths = sourceFiles
    .map(relativeProjectPath)
    .filter((file) => file.split("/").some((segment) => forbiddenLegacySegments.has(segment)));

  const forbiddenSourcePatterns = [
    { label: "better-sqlite3", pattern: /better-sqlite3/ },
    { label: "SQLite DATABASE_PATH", pattern: /\bDATABASE_PATH\b/ },
    { label: "SQLite UNIQUE signature", pattern: /UNIQUE constraint failed/i },
    { label: "SQLite foreign-key signature", pattern: /FOREIGN KEY constraint failed/i },
    { label: "Semrush clone identity", pattern: /semrush/i },
    { label: "GitNexus", pattern: /gitnexus/i },
    { label: "clone wording", pattern: /\bclone\b|클론|복제/i },
    { label: "legacy CRUD", pattern: /\bcrud\b|\bResourceSpec\b|\bListMetaShape\b/i },
    { label: "legacy API namespace", pattern: /\/api\/(?!v1(?:\/|$))/ },
  ] as const;
  const forbiddenContents = sourceFiles
    .filter((file) => !/\.(?:test|spec)\.[^.]+$/.test(file))
    .flatMap((file) => {
      const contents = fs.readFileSync(file, "utf8");
      return forbiddenSourcePatterns
        .filter(({ pattern }) => pattern.test(contents))
        .map(({ label }) => ({ file: relativeProjectPath(file), label }));
    });

  assert.deepEqual(forbiddenPaths, [], `레거시 기능 경로:\n${JSON.stringify(forbiddenPaths, null, 2)}`);
  assert.deepEqual(forbiddenContents, [], `금지 소스:\n${JSON.stringify(forbiddenContents, null, 2)}`);
});

test("공개 자산과 제품 문서에는 clone 자산·구 URL redirect·SQLite 흔적이 없다", () => {
  const artifactRoots = ["public", "scripts", "docs"];
  const artifactFiles = [
    ...artifactRoots.flatMap((root) => walkFiles(path.join(projectRoot, root))),
    path.join(projectRoot, "README.md"),
    path.join(projectRoot, "next.config.ts"),
  ]
    .filter((file) => fs.existsSync(file))
    .filter((file) => relativeProjectPath(file) !== "docs/planning/06-tasks.md");
  const forbiddenPathNames = artifactFiles
    .map(relativeProjectPath)
    .filter((file) => /semrush|gitnexus/i.test(file));
  const readableFiles = artifactFiles.filter((file) =>
    /\.(?:css|html|js|json|md|mjs|svg|ts|tsx|txt|yaml|yml)$/.test(file),
  );
  const forbiddenContents = readableFiles.flatMap((file) => {
    const contents = fs.readFileSync(file, "utf8");
    return [
      { label: "clone identity", pattern: /semrush|gitnexus/i },
      { label: "SQLite runtime", pattern: /better-sqlite3|\bDATABASE_PATH\b/i },
    ]
      .filter(({ pattern }) => pattern.test(contents))
      .map(({ label }) => ({ file: relativeProjectPath(file), label }));
  });
  const nextConfig = fs.readFileSync(path.join(projectRoot, "next.config.ts"), "utf8");

  assert.deepEqual(forbiddenPathNames, [], `금지 공개 파일명: ${forbiddenPathNames.join(", ")}`);
  assert.deepEqual(forbiddenContents, [], `금지 공개 내용:\n${JSON.stringify(forbiddenContents, null, 2)}`);
  assert.doesNotMatch(nextConfig, /\bredirects\s*\(/, "구 제품 URL은 redirect 없이 404여야 한다");
  assert.equal(fs.existsSync(path.join(projectRoot, "public", "llms.txt")), false);
});
