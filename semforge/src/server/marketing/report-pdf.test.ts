import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { renderMarketingSnapshotPdf } from "./report-pdf";

describe("marketing snapshot PDF", () => {
  it("renders deterministically from a frozen snapshot without a provider call", async () => {
    const snapshot = {
      id: "snapshot-1", reportType: "marketing_overview", rangeFrom: "2026-07-01", rangeTo: "2026-07-31",
      createdAt: new Date("2026-08-06T10:00:00Z"),
      payload: { status: "live", data: { overview: { clicks: 80, impressions: 1000, sessions: 100, engagedSessions: 60, keyEvents: 4, revenue: 125000 } } },
      provenance: { source: ["airbyte:google-analytics-data-api", "airbyte:google-search-console"], cache: "fresh", measurement: "calculated", fetchedAt: "2026-08-06T09:00:00Z" },
    } as const;
    const first = await renderMarketingSnapshotPdf(snapshot);
    const second = await renderMarketingSnapshotPdf(snapshot);
    assert.equal(Buffer.from(first).subarray(0, 4).toString(), "%PDF");
    assert.equal(createHash("sha256").update(first).digest("hex"), createHash("sha256").update(second).digest("hex"));
  });
});
