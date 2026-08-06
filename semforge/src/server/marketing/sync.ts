import { registerDueJob } from "@/server/providers/scheduler";
import { airbyteFromEnv, type AirbyteHttpAdapter } from "./airbyte";
import { marketingFlags } from "./config";
import { postgresMarketingTransformerFromEnv } from "./postgres";
import { listMarketingConnectionsForJobDiscovery, listOpenMarketingSyncRuns, marketingControl, purgeMarketingControlData, updateMarketingSyncRun } from "./store";
import { canonicalBatchFromAirbyte } from "./transform";

let registered = false;

export async function discoverScheduledMarketingSyncs(input: { adapter: AirbyteHttpAdapter; limit?: number }) {
  const connections = await listMarketingConnectionsForJobDiscovery(input.limit ?? 25);
  let discovered = 0;
  for (const connection of connections) {
    if (!connection.airbyteConnectionId) continue;
    const jobs = await input.adapter.listJobs(connection.airbyteConnectionId, 10);
    for (const job of jobs) {
      await marketingControl.createSyncRun({
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        airbyteJobId: String(job.jobId),
      });
      discovered += 1;
    }
  }
  return { connections: connections.length, jobsSeen: discovered };
}

export async function reconcileMarketingSyncs(input: {
  adapter: AirbyteHttpAdapter;
  limit?: number;
  onSucceeded: (run: Awaited<ReturnType<typeof listOpenMarketingSyncRuns>>[number]) => Promise<void>;
}) {
  const runs = await listOpenMarketingSyncRuns(input.limit ?? 25);
  let processed = 0; let failed = 0; const errors: string[] = [];
  for (const row of runs) {
    try {
      const job = await input.adapter.getJob(row.run.airbyteJobId);
      const status = job.status.toLowerCase();
      if (["pending", "queued", "running", "incomplete"].includes(status)) {
        await updateMarketingSyncRun({ id: row.run.id, connectionId: row.connection.id, status: "running" });
        continue;
      }
      if (["succeeded", "success", "completed"].includes(status)) {
        try {
          await input.onSucceeded(row);
          await updateMarketingSyncRun({ id: row.run.id, connectionId: row.connection.id, status: "succeeded", rowCount: job.rowsSynced ?? null });
          processed += 1;
        } catch {
          await updateMarketingSyncRun({ id: row.run.id, connectionId: row.connection.id, status: "failed", errorCode: "MARKETING_TRANSFORM_FAILED" });
          failed += 1; errors.push(`sync run ${row.run.id} 변환 실패`);
        }
      } else {
        await updateMarketingSyncRun({ id: row.run.id, connectionId: row.connection.id, status: status === "cancelled" ? "cancelled" : "failed", errorCode: "AIRBYTE_JOB_FAILED" });
        failed += 1;
      }
    } catch {
      await updateMarketingSyncRun({ id: row.run.id, connectionId: row.connection.id, status: "failed", errorCode: "AIRBYTE_STATUS_FAILED" });
      failed += 1; errors.push(`sync run ${row.run.id} 상태 확인 실패`);
    }
  }
  return { scanned: runs.length, processed, failed, errors };
}

export function ensureMarketingSyncDueJob() {
  if (registered || !marketingFlags.ingestion()) return;
  registered = true;
  registerDueJob("marketing_sync", async ({ limit, now }) => {
    const adapter = airbyteFromEnv();
    const transformer = postgresMarketingTransformerFromEnv();
    const secret = process.env.APP_SECRET?.trim();
    if (!adapter || !transformer || !secret) {
      return { scanned: 0, processed: 0, failed: 0, errors: ["Airbyte 변환 구성이 없습니다."] };
    }
    await discoverScheduledMarketingSyncs({ adapter, limit });
    const result = await reconcileMarketingSyncs({
      adapter,
      limit,
      onSucceeded: async (row) => {
        if (!row.connection.rawNamespace) throw new Error("raw namespace가 없습니다.");
        const records = await transformer.readAirbyteRecords({
          namespace: row.connection.rawNamespace,
          provider: row.connection.provider,
        });
        await transformer.upsertCanonicalBatch(canonicalBatchFromAirbyte({
          workspaceId: row.connection.workspaceId,
          folderId: row.binding.folderId,
          secret,
          records,
          refreshedAt: now,
        }));
        await transformer.purgeRetention({
          namespace: row.connection.rawNamespace,
          provider: row.connection.provider,
          now,
        });
      },
    });
    await purgeMarketingControlData(now);
    return result;
  });
}
