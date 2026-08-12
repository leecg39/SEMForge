#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const appRoot = path.join(projectRoot, "src", "app");
const evidenceDir = path.join(projectRoot, ".omo", "evidence", "phase5-ci", "latest");
fs.mkdirSync(evidenceDir, { recursive: true });

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
  "/api/v1/reports",
  "/api/v1/reports/[reportId]",
  "/api/v1/reports/[reportId]/pdf",
  "/api/v1/reports/branding",
  "/api/v1/sites",
  "/api/v1/sites/[siteId]",
  "/api/v1/tracking",
  "/api/v1/tracking/[trackingId]",
  "/api/v1/webhooks/toss",
  "/health/live",
  "/health/ready",
]);

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(absolute);
    return entry.isFile() ? [absolute] : [];
  });
}

function routePath(file) {
  const segments = path
    .relative(appRoot, path.dirname(file))
    .split(path.sep)
    .filter((segment) => segment && !/^\(.+\)$/.test(segment) && !segment.startsWith("@"));
  return `/${segments.join("/")}`;
}

function relative(file) {
  return path.relative(projectRoot, file).split(path.sep).join("/");
}

function assertExact(label, actual, expected) {
  const missing = [...expected].filter((route) => !actual.has(route)).toSorted();
  const extra = [...actual].filter((route) => !expected.has(route)).toSorted();
  if (missing.length || extra.length) {
    throw new Error(`${label} mismatch: missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`);
  }
}

const pageFiles = walkFiles(appRoot).filter((file) => /^page\.(?:ts|tsx|js|jsx)$/.test(path.basename(file)));
const routeFiles = walkFiles(appRoot).filter((file) => /^route\.(?:ts|tsx|js|jsx)$/.test(path.basename(file)));
const pages = pageFiles.map((file) => ({ file: relative(file), route: routePath(file) })).toSorted((a, b) => a.route.localeCompare(b.route));
const routes = routeFiles.map((file) => ({ file: relative(file), route: routePath(file) })).toSorted((a, b) => a.route.localeCompare(b.route));

assertExact("page routes", new Set(pages.map(({ route }) => route)), allowedPages);
assertExact("api routes", new Set(routes.map(({ route }) => route)), allowedExactRoutes);

const manifest = {
  status: "passed",
  pages,
  routes,
  pageCount: pages.length,
  routeCount: routes.length,
};

fs.writeFileSync(path.join(evidenceDir, "route-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`route manifest passed: pages=${pages.length} routes=${routes.length}`);
