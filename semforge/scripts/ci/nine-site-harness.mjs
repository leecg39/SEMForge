#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const evidenceDir = path.join(projectRoot, ".omo", "evidence", "phase5-ci", "latest");
fs.mkdirSync(evidenceDir, { recursive: true });

const forbiddenNetwork = new Set(["fetch", "XMLHttpRequest", "WebSocket"]);
const touchedNetwork = [];
for (const key of forbiddenNetwork) {
  if (key in globalThis) {
    globalThis[key] = function blockedNetworkBoundary() {
      touchedNetwork.push(key);
      throw new Error(`external network is disabled in nine-site harness: ${key}`);
    };
  }
}

function buildFixture() {
  return Array.from({ length: 3 }, (_, partnerIndex) => ({
    workspaceId: `workspace-${partnerIndex + 1}`,
    partnerName: `Partner ${partnerIndex + 1}`,
    sites: Array.from({ length: 3 }, (_, siteIndex) => {
      const siteNumber = partnerIndex * 3 + siteIndex + 1;
      return {
        siteId: `site-${siteNumber}`,
        domain: `example-${siteNumber}.co.kr`,
        rankKeywords: Array.from({ length: 20 }, (__, keywordIndex) => `site${siteNumber}-rank-${keywordIndex + 1}`),
        aioPrompts: Array.from({ length: 20 }, (__, promptIndex) => `site${siteNumber}-aio-${promptIndex + 1}`),
      };
    }),
  }));
}

function collect(workspaces) {
  return workspaces.flatMap((workspace) =>
    workspace.sites.flatMap((site) => [
      ...site.rankKeywords.map((query, index) => ({
        workspaceId: workspace.workspaceId,
        siteId: site.siteId,
        type: "google_rank",
        query,
        position: index === 19 ? ">100" : index + 1,
      })),
      ...site.aioPrompts.map((query, index) => ({
        workspaceId: workspace.workspaceId,
        siteId: site.siteId,
        type: "google_aio",
        query,
        aioPresence: index % 5 === 0 ? "unknown" : index % 2 === 0 ? "present" : "absent",
      })),
    ]),
  );
}

const workspaces = buildFixture();
const observations = collect(workspaces);
const siteCount = workspaces.reduce((sum, workspace) => sum + workspace.sites.length, 0);
const rankKeywordCount = observations.filter((observation) => observation.type === "google_rank").length;
const aioPromptCount = observations.filter((observation) => observation.type === "google_aio").length;
const weeklyReports = workspaces.flatMap((workspace) =>
  workspace.sites.map((site) => ({
    workspaceId: workspace.workspaceId,
    siteId: site.siteId,
    status: "snapshot_ready",
    sourceObservationCount: observations.filter((observation) => observation.siteId === site.siteId).length,
  })),
);

const summary = {
  status: "passed",
  evidenceKind: "synthetic-limit-fixture",
  proves: "workspace/site/query/report cardinality fixture only",
  doesNotProve: "real partner onboarding, live provider collection, payment, PDF rendering, or email delivery",
  externalNetworkCalls: touchedNetwork.length,
  workspaceCount: workspaces.length,
  siteCount,
  rankKeywordCount,
  aioPromptCount,
  observationCount: observations.length,
  reportCount: weeklyReports.length,
  limits: {
    maxSitesPerWorkspace: 3,
    maxRankKeywordsPerSite: 20,
    maxAioPromptsPerSite: 20,
  },
};

if (
  summary.externalNetworkCalls !== 0 ||
  summary.workspaceCount !== 3 ||
  summary.siteCount !== 9 ||
  summary.rankKeywordCount !== 180 ||
  summary.aioPromptCount !== 180 ||
  summary.observationCount !== 360 ||
  summary.reportCount !== 9 ||
  weeklyReports.some((report) => report.sourceObservationCount !== 40)
) {
  summary.status = "failed";
  fs.writeFileSync(path.join(evidenceDir, "nine-site-harness.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

fs.writeFileSync(path.join(evidenceDir, "nine-site-harness.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  `nine-site synthetic limit fixture passed: workspaces=${summary.workspaceCount} sites=${summary.siteCount} observations=${summary.observationCount} reports=${summary.reportCount}`,
);
