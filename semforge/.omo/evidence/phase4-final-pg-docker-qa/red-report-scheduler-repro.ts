import assert from "node:assert/strict";

import { Pool } from "pg";

import { PostgresWeeklyCollectionScheduler } from "@/worker/scheduler";

const databaseUrl = process.env.QA_DATABASE_URL;
if (!databaseUrl) throw new Error("QA_DATABASE_URL is required");

const owner = new Pool({ connectionString: databaseUrl, ssl: false, max: 4 });
const scheduler = new Pool({
  connectionString: databaseUrl,
  ssl: false,
  max: 4,
  ...(process.env.QA_SCHEDULER_AS_OWNER === "1"
    ? {}
    : { options: "-c role=semforge_scheduler" }),
});

async function main(): Promise<void> {
  const workspaceIds = [
    "64000000-0000-4000-8000-000000000001",
    "64000000-0000-4000-8000-000000000002",
    "64000000-0000-4000-8000-000000000003",
  ];
  for (const [workspaceIndex, workspaceId] of workspaceIds.entries()) {
    await owner.query(
      "insert into workspaces (id, name, slug) values ($1, $2, $3)",
      [workspaceId, `QA workspace ${workspaceIndex + 1}`, `qa-workspace-${workspaceIndex + 1}`],
    );
    for (let siteIndex = 1; siteIndex <= 3; siteIndex += 1) {
      const site = await owner.query<{ id: string }>(
        `insert into sites (workspace_id, name, domain)
         values ($1, $2, $3) returning id::text`,
        [workspaceId, `QA site ${siteIndex}`, `qa-w${workspaceIndex + 1}-s${siteIndex}.example.com`],
      );
      await owner.query(
        `insert into tracked_queries (workspace_id, site_id, type, query, normalized_query)
         values ($1, $2, 'rank', $3, $4), ($1, $2, 'aio', $3, $4)`,
        [workspaceId, site.rows[0]!.id, `QA W${workspaceIndex + 1} S${siteIndex}`, `qa w${workspaceIndex + 1} s${siteIndex}`],
      );
    }
  }

  const collection = await new PostgresWeeklyCollectionScheduler(scheduler).schedule({
    executedAt: new Date("2026-08-16T09:00:00.000Z"),
  });
  const counts = await owner.query<{ topic: string; count: number }>(
    `select topic, count(*)::int as count
       from outbox
      group by topic
      order by topic`,
  );
  const reportSnapshots = counts.rows.find(({ topic }) => topic === "report.snapshot")?.count ?? 0;
  console.log(JSON.stringify({
    postgres: (await owner.query<{ version: string }>("show server_version")).rows[0]!.version,
    workspaces: 3,
    sites: 9,
    collection,
    outbox: counts.rows,
    reportSnapshots,
  }, null, 2));
  assert.equal(reportSnapshots, 9, "active site마다 report.snapshot outbox가 1건이어야 한다");
}

void main().finally(async () => {
  await Promise.all([owner.end(), scheduler.end()]);
});
