import fs from "node:fs/promises";
import { Client } from "pg";
import type { AirbyteRawRecord } from "@/server/marketing/contracts";
import { canonicalBatchFromAirbyte } from "@/server/marketing/transform";
import { PostgresMarketingAdapter } from "@/server/marketing/postgres";

const connectionString = process.env.ANALYTICS_TRANSFORM_DATABASE_URL?.trim();
const file = process.env.MARKETING_BATCH_FILE?.trim();
const workspaceId = process.env.MARKETING_WORKSPACE_ID?.trim();
const folderId = process.env.MARKETING_FOLDER_ID?.trim();
const secret = process.env.APP_SECRET?.trim();
if (!connectionString || !file || !workspaceId || !folderId || !secret) {
  throw new Error("ANALYTICS_TRANSFORM_DATABASE_URL, MARKETING_BATCH_FILE, MARKETING_WORKSPACE_ID, MARKETING_FOLDER_ID, APP_SECRET이 필요합니다.");
}
const payload = JSON.parse(await fs.readFile(file, "utf8")) as { records?: AirbyteRawRecord[] } | AirbyteRawRecord[];
const records = Array.isArray(payload) ? payload : payload.records ?? [];
const client = new Client({ connectionString, application_name: "semforge_marketing_transform" });
await client.connect();
try {
  const adapter = new PostgresMarketingAdapter(client);
  await adapter.migrate();
  await adapter.upsertCanonicalBatch(canonicalBatchFromAirbyte({ workspaceId, folderId, secret, records, refreshedAt: new Date() }));
  console.log(`[marketing] ${records.length} raw records normalized without retaining CRM PII`);
} finally {
  await client.end();
}
