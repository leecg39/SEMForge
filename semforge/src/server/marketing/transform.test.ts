import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalBatchFromAirbyte } from "./transform";

describe("Airbyte raw normalization", () => {
  it("maps selected GSC, GA4 and HubSpot streams while discarding CRM PII", () => {
    const batch = canonicalBatchFromAirbyte({
      workspaceId: "ws-1", folderId: "folder-1", secret: "workspace-secret",
      records: [
        { stream: "gsc_pages", data: { date: "2026-08-05", page: "https://example.com/?utm_source=x", clicks: 12, impressions: 120, ctr: 0.1, position: 2.4 } },
        { stream: "ga4_pages", data: { date: "2026-08-05", page_location: "https://example.com/", sessions: 20, engaged_sessions: 15, key_events: 2, total_revenue: 30000 } },
        { stream: "hubspot_deals", data: { date: "2026-08-05", id: "deal-1", email: "person@example.com", phone: "010-0000-0000", amount: 500000, utm_source: "google", gclid: "abc", landing_page: "https://example.com/" } },
      ],
      refreshedAt: new Date("2026-08-06T09:00:00Z"),
    });
    assert.equal(batch.gscPages.length, 1);
    assert.equal(batch.ga4Pages.length, 1);
    assert.equal(batch.attribution[0].attribution, "confirmed");
    assert.match(batch.attribution[0].pseudonymousEntityId, /^[a-f0-9]{64}$/u);
    assert.equal(JSON.stringify(batch).includes("person@example.com"), false);
    assert.equal(JSON.stringify(batch).includes("010-0000-0000"), false);
  });

  it("derives CRM pseudonyms per workspace to prevent cross-tenant correlation", () => {
    const input = {
      folderId: "folder-1", secret: "application-secret",
      records: [{ stream: "hubspot_deals" as const, data: { date: "2026-08-05", id: "shared-external-id", amount: 1 } }],
      refreshedAt: new Date("2026-08-06T09:00:00Z"),
    };
    const first = canonicalBatchFromAirbyte({ ...input, workspaceId: "ws-1" });
    const second = canonicalBatchFromAirbyte({ ...input, workspaceId: "ws-2" });
    assert.notEqual(first.attribution[0].pseudonymousEntityId, second.attribution[0].pseudonymousEntityId);
  });
});
