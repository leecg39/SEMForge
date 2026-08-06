import { Client } from "pg";
import { PostgresMarketingAdapter } from "@/server/marketing/postgres";

const connectionString = process.env.ANALYTICS_TRANSFORM_DATABASE_URL?.trim();
if (!connectionString) throw new Error("ANALYTICS_TRANSFORM_DATABASE_URL이 필요합니다.");
const client = new Client({ connectionString, application_name: "semforge_marketing_migration" });
await client.connect();
try {
  await new PostgresMarketingAdapter(client).migrate();
  console.log("[marketing] Postgres canonical facts and marts are ready");
} finally {
  await client.end();
}
