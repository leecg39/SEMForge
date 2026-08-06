import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PostgresMarketingAdapter } from "./postgres";

describe("Postgres marketing marts", () => {
  it("joins separately synced GSC and GA4 facts without overwriting either provider", async () => {
    const database = new PGlite();
    const adapter = new PostgresMarketingAdapter(database);
    await adapter.migrate();
    const gscBatch = {
      workspaceId: "ws-1",
      folderId: "folder-1",
      refreshedAt: new Date("2026-08-06T09:00:00Z"),
      gscPages: [{
        date: "2026-08-05", url: "https://EXAMPLE.com/Guide/?utm_source=google", clicks: 80,
        impressions: 1000, ctr: 0.08, position: 3.2,
      }],
      ga4Pages: [],
      channels: [],
      campaigns: [],
      attribution: [],
    };
    const ga4Batch = {
      workspaceId: "ws-1",
      folderId: "folder-1",
      refreshedAt: new Date("2026-08-06T09:30:00Z"),
      gscPages: [],
      ga4Pages: [{
        date: "2026-08-05", url: "https://example.com/Guide", sessions: 100,
        engagedSessions: 60, keyEvents: 4, revenue: 125000,
      }],
      channels: [{
        date: "2026-08-05", channel: "Organic Search", sessions: 100,
        engagedSessions: 60, keyEvents: 4, revenue: 125000, cost: 0,
      }],
      campaigns: [],
      attribution: [],
    };

    await adapter.upsertCanonicalBatch(gscBatch);
    await adapter.upsertCanonicalBatch(ga4Batch);
    await adapter.upsertCanonicalBatch(ga4Batch);
    const report = await adapter.getTrafficReport({ workspaceId: "ws-1", folderId: "folder-1", from: "2026-08-01", to: "2026-08-06" });

    assert.equal(report?.pages.length, 1);
    assert.equal(report?.pages[0].url, "https://example.com/Guide");
    assert.equal(report?.pages[0].clicks, 80);
    assert.equal(report?.pages[0].sessions, 100);
    assert.equal(report?.overview.clicks, 80);
    assert.equal(report?.overview.sessions, 100);
    assert.equal(report?.fetchedAt.toISOString(), "2026-08-06T09:30:00.000Z");
    await database.close();
  });

  it("reads supported typed raw streams and returns campaign marts", async () => {
    const database = new PGlite();
    const adapter = new PostgresMarketingAdapter(database);
    await adapter.migrate();
    await database.exec(`
      CREATE SCHEMA raw_abcdef12;
      CREATE TABLE raw_abcdef12.campaigns (
        date text, campaign_id text, campaign_name text, impressions integer,
        clicks integer, cost numeric, conversions numeric, conversion_value numeric
      );
      INSERT INTO raw_abcdef12.campaigns VALUES ('2026-08-05','cmp-1','Brand',1000,50,100000,5,500000);
    `);
    const records = await adapter.readAirbyteRecords({ namespace: "raw_abcdef12", provider: "google_ads" });
    assert.equal(records.length, 1);
    assert.equal(records[0].stream, "google_ads_campaigns");
    await adapter.upsertCanonicalBatch({
      workspaceId: "ws-1", folderId: "folder-1", refreshedAt: new Date("2026-08-06T09:00:00Z"),
      gscPages: [], ga4Pages: [], channels: [], attribution: [],
      campaigns: [{
        provider: "google_ads", date: "2026-08-05", externalCampaignId: "cmp-1", campaign: "Brand",
        impressions: 1000, clicks: 50, cost: 100000, conversions: 5, revenue: 500000,
      }],
    });
    const report = await adapter.getCampaignReport({ workspaceId: "ws-1", folderId: "folder-1", from: "2026-08-01", to: "2026-08-06", provider: "google_ads" });
    assert.equal(report?.rows[0].cpa, 20000);
    assert.equal(report?.rows[0].roas, 5);
    await database.close();
  });

  it("stores only pseudonymous CRM facts in the canonical mart", async () => {
    const database = new PGlite();
    const adapter = new PostgresMarketingAdapter(database);
    await adapter.migrate();
    await adapter.upsertCanonicalBatch({
      workspaceId: "ws-1", folderId: "folder-1", refreshedAt: new Date("2026-08-06T09:00:00Z"),
      gscPages: [], ga4Pages: [], channels: [], campaigns: [],
      attribution: [{
        date: "2026-08-05", pseudonymousEntityId: "a".repeat(64), channel: "Paid Search",
        campaign: "Brand", landingPage: "https://example.com/", conversions: 1, revenue: 500000,
        attribution: "confirmed", evidence: ["gclid"],
      }],
    });
    const result = await adapter.getAttributionReport({ workspaceId: "ws-1", folderId: "folder-1", from: "2026-08-01", to: "2026-08-06" });
    assert.equal(result?.rows[0].attribution, "confirmed");
    const columns = await database.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'marketing' and table_name = 'mart_attribution'",
    );
    assert.equal(columns.rows.some((column) => ["email", "name", "phone"].includes(column.column_name)), false);
    await database.close();
  });

  it("rejects raw namespace injection and enforces HubSpot raw retention", async () => {
    const database = new PGlite();
    const adapter = new PostgresMarketingAdapter(database);
    await adapter.migrate();
    await assert.rejects(() => adapter.deleteRawNamespace('raw_x"; DROP SCHEMA marketing;--'), /허용되지 않은/u);
    await database.exec(`
      CREATE SCHEMA raw_1234abcd;
      CREATE TABLE raw_1234abcd.deals (id text, _airbyte_extracted_at timestamptz);
      INSERT INTO raw_1234abcd.deals VALUES
        ('expired', '2026-07-20T00:00:00Z'),
        ('retained', '2026-08-05T00:00:00Z');
    `);
    await adapter.purgeRetention({ namespace: "raw_1234abcd", provider: "hubspot", now: new Date("2026-08-06T00:00:00Z") });
    const rows = await database.query<{ id: string }>("SELECT id FROM raw_1234abcd.deals ORDER BY id");
    assert.deepEqual(rows.rows.map((row) => row.id), ["retained"]);
    await database.close();
  });
});
