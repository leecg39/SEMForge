import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthContext } from "@/lib/session";
import { createMarketingIntelligence } from "./service";
import type { MarketingControlPort, MarketingMartPort } from "./ports";

const auth = {
  userId: "user-1", email: "owner@example.test", name: "Owner", workspaceId: "ws-1",
  workspaceName: "Acme", workspacePlan: "pro", role: "owner", sessionId: "session-1",
  ip: null, userAgent: null,
} satisfies AuthContext;

function fixtures() {
  const control: MarketingControlPort = {
    assertFolder: async () => undefined,
    listConnections: async () => [{
      id: "mc-1", workspaceId: "ws-1", provider: "ga4", status: "active",
      airbyteSourceId: "source-1", airbyteConnectionId: "conn-1", rawNamespace: "raw_ws1",
      lastSucceededAt: new Date("2026-08-06T09:00:00Z"),
      lastAttemptedAt: new Date("2026-08-06T09:00:00Z"), errorCode: null,
    }],
    getConnection: async () => null,
    createSyncRun: async () => undefined,
    disconnect: async () => undefined,
  };
  const mart: MarketingMartPort = {
    getTrafficReport: async () => ({
      fetchedAt: new Date("2026-08-06T09:00:00Z"),
      overview: { clicks: 80, impressions: 1000, sessions: 100, engagedSessions: 60, keyEvents: 4, revenue: 125000 },
      channels: [], pages: [],
    }),
    getAttributionReport: async () => ({ fetchedAt: new Date("2026-08-06T09:00:00Z"), rows: [] }),
    getCampaignReport: async () => null,
  };
  return { control, mart };
}

describe("Marketing Intelligence module", () => {
  it("returns tenant-scoped mart data with provenance and calculated KPIs", async () => {
    const { control, mart } = fixtures();
    const service = createMarketingIntelligence({ control, mart, now: () => new Date("2026-08-06T10:00:00Z") });
    const result = await service.getTrafficReport(auth, "folder-1", {
      from: "2026-07-01", to: "2026-07-31", view: "overview",
    });
    assert.equal(result.status, "live");
    assert.equal(result.cache, "fresh");
    assert.equal(result.measurement, "calculated");
    assert.deepEqual(result.source, ["airbyte:google-analytics-data-api", "airbyte:google-search-console"]);
    assert.equal(result.data?.overview.clickSessionRatio, 1.25);
  });

  it("serves stale marts up to 24 hours and refuses expired data", async () => {
    const { control, mart } = fixtures();
    const staleService = createMarketingIntelligence({ control, mart, now: () => new Date("2026-08-07T08:00:00Z") });
    assert.equal((await staleService.getTrafficReport(auth, "folder-1", { from: "2026-07-01", to: "2026-07-31", view: "overview" })).cache, "stale");

    const expiredService = createMarketingIntelligence({ control, mart, now: () => new Date("2026-08-07T10:00:01Z") });
    const expired = await expiredService.getTrafficReport(auth, "folder-1", { from: "2026-07-01", to: "2026-07-31", view: "overview" });
    assert.equal(expired.status, "unavailable");
    assert.equal(expired.data, undefined);
  });

  it("rejects impossible calendar dates before querying Postgres", async () => {
    const { control, mart } = fixtures();
    const service = createMarketingIntelligence({ control, mart });
    await assert.rejects(
      () => service.getTrafficReport(auth, "folder-1", { from: "2026-02-30", to: "2026-03-01", view: "overview" }),
      /조회 기간/u,
    );
  });

  it("deletes tenant raw data before external resources and the local tombstone", async () => {
    const { control, mart } = fixtures();
    const order: string[] = [];
    control.getConnection = async () => ({
      id: "mc-1", workspaceId: "ws-1", provider: "ga4", status: "active",
      airbyteSourceId: "source-1", airbyteConnectionId: "conn-1", rawNamespace: "raw_abcdef12",
      lastAttemptedAt: null, lastSucceededAt: null, errorCode: null,
    });
    control.disconnect = async () => { order.push("local"); };
    const service = createMarketingIntelligence({
      control,
      mart,
      rawAdmin: { deleteRawNamespace: async () => { order.push("raw"); } },
      airbyte: {
        hasActiveJob: async () => false,
        triggerSync: async () => ({ jobId: 1, status: "pending" }),
        deleteConnection: async () => { order.push("connection"); },
        deleteSource: async () => { order.push("source"); },
      },
    });
    await service.disconnect(auth, "mc-1");
    assert.deepEqual(order, ["raw", "connection", "source", "local"]);
  });

  it("blocks viewer mutations and stops deletion when raw cleanup fails", async () => {
    const { control, mart } = fixtures();
    const order: string[] = [];
    control.getConnection = async () => ({
      id: "mc-1", workspaceId: "ws-1", provider: "ga4", status: "active",
      airbyteSourceId: "source-1", airbyteConnectionId: "conn-1", rawNamespace: "raw_abcdef12",
      lastAttemptedAt: null, lastSucceededAt: null, errorCode: null,
    });
    control.disconnect = async () => { order.push("local"); };
    const service = createMarketingIntelligence({
      control,
      mart,
      rawAdmin: { deleteRawNamespace: async () => { throw new Error("database unavailable"); } },
      airbyte: {
        hasActiveJob: async () => false,
        triggerSync: async () => ({ jobId: 1, status: "pending" }),
        deleteConnection: async () => { order.push("connection"); },
        deleteSource: async () => { order.push("source"); },
      },
    });
    await assert.rejects(() => service.requestSync({ ...auth, role: "viewer" }, "mc-1"), /읽기 전용/u);
    await assert.rejects(() => service.disconnect(auth, "mc-1"), /database unavailable/u);
    assert.deepEqual(order, []);
  });
});
