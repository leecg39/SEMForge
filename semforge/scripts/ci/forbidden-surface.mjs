#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const evidenceDir = path.join(projectRoot, ".omo", "evidence", "phase5-ci", "latest");
fs.mkdirSync(evidenceDir, { recursive: true });

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

const forbiddenPatterns = [
  ["better-sqlite3", /better-sqlite3/i],
  ["SQLite DATABASE_PATH", /\bDATABASE_PATH\b/],
  ["SQLite UNIQUE signature", /UNIQUE constraint failed/i],
  ["SQLite foreign-key signature", /FOREIGN KEY constraint failed/i],
  ["Semrush clone identity", /semrush/i],
  ["GitNexus", /gitnexus/i],
  ["clone wording", /\bclone\b|클론|복제/i],
  ["legacy CRUD", /\bcrud\b|\bResourceSpec\b|\bListMetaShape\b/i],
  ["legacy API namespace", /\/api\/(?!v1(?:\/|$))/],
];

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(absolute);
    return entry.isFile() ? [absolute] : [];
  });
}

function relative(file) {
  return path.relative(projectRoot, file).split(path.sep).join("/");
}

const roots = ["src/app", "src/components", "src/server", "src/lib", "src/i18n", "src/types", "public", "scripts", "docs"];
const files = [
  ...roots.flatMap((root) => walkFiles(path.join(projectRoot, root))),
  path.join(projectRoot, "README.md"),
  path.join(projectRoot, "next.config.ts"),
]
  .filter((file) => fs.existsSync(file))
  .filter((file) => relative(file) !== "docs/planning/06-tasks.md")
  .filter((file) => !relative(file).startsWith("scripts/ci/"))
  .filter((file) => /\.(?:css|html|js|json|md|mjs|svg|ts|tsx|txt|yaml|yml)$/.test(file));

const forbiddenPaths = files
  .map(relative)
  .filter((file) => file.split("/").some((segment) => forbiddenLegacySegments.has(segment)));
const forbiddenContents = files
  .filter((file) => !/\.(?:test|spec)\.[^.]+$/.test(file))
  .flatMap((file) => {
    const contents = fs.readFileSync(file, "utf8");
    return forbiddenPatterns
      .filter(([, pattern]) => pattern.test(contents))
      .map(([label]) => ({ file: relative(file), label }));
  });

const summary = {
  status: forbiddenPaths.length || forbiddenContents.length ? "failed" : "passed",
  checkedFiles: files.length,
  forbiddenPaths,
  forbiddenContents,
};

fs.writeFileSync(path.join(evidenceDir, "forbidden-surface.json"), `${JSON.stringify(summary, null, 2)}\n`);
if (summary.status !== "passed") {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

console.log(`forbidden surface passed: checkedFiles=${files.length}`);
