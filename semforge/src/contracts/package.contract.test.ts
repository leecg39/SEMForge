// @TASK P1-V - 패키지·실행 스크립트 경계 정리
// @SPEC docs/planning/06-tasks.md#p1-v--1주차-통합-품질-게이트
// @TEST src/contracts/package.contract.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

interface PackageManifest {
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
) as PackageManifest;

const forbiddenScriptNames = [
  "test:analytics",
  "test:marketing",
  "test:siteaudit",
  "test:backlinks",
  "test:backlink-audit",
  "test:position",
  "test:ai-visibility",
  "test:seo-dashboard",
  "test:content",
  "test:social",
  "content:migrate-svg",
  "loop:bootstrap",
  "loop:verify",
  "loop:smoke",
  "chatmock:login",
  "chatmock:serve",
] as const;

const forbiddenRuntimeDependencies = [
  "@radix-ui/react-accordion",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-icons",
  "@radix-ui/react-select",
  "@radix-ui/react-tabs",
  "react-markdown",
  "recharts",
  "remark-gfm",
] as const;

test("Node 24와 TypeScript·TSX 테스트 파일을 모두 실행하는 기본 계약을 고정한다", () => {
  assert.equal(manifest.engines?.node, ">=24 <25");
  assert.equal(
    manifest.scripts?.test,
    'tsx --test "src/**/*.test.ts" "src/**/*.test.tsx" "scripts/**/*.test.ts"',
  );
});

test("삭제된 레거시 기능을 가리키는 실행 스크립트가 없다", () => {
  const scripts = manifest.scripts ?? {};
  const staleScripts = forbiddenScriptNames.filter((name) => name in scripts);

  assert.deepEqual(staleScripts, []);
});

test("삭제된 레거시 UI 전용 런타임 패키지가 없다", () => {
  const dependencies = manifest.dependencies ?? {};
  const staleDependencies = forbiddenRuntimeDependencies.filter((name) => name in dependencies);

  assert.deepEqual(staleDependencies, []);
  assert.equal("node-html-parser" in (manifest.devDependencies ?? {}), false);
  assert.equal("agentation" in (manifest.devDependencies ?? {}), true);
});

test("핵심 웹·PostgreSQL·PDF 자산 의존성은 유지한다", () => {
  const dependencies = manifest.dependencies ?? {};
  const required = [
    "@fontsource/noto-sans-kr",
    "drizzle-orm",
    "next",
    "pdf-lib",
    "pg",
    "react",
    "react-dom",
    "sharp",
    "zod",
  ];

  assert.deepEqual(
    required.filter((name) => !(name in dependencies)),
    [],
  );
});
