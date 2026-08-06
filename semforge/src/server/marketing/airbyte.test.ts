import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AirbyteHttpAdapter, sanitizeProviderError } from "./airbyte";

describe("Airbyte HTTP adapter", () => {
  it("creates hourly connections and triggers sync jobs through the public API", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/v1/streams?")) {
        return Response.json([{
          streamName: "pages", syncModes: ["incremental_deduped_history"],
          defaultCursorField: ["date"], sourceDefinedPrimaryKey: [["date"], ["page_location"]],
        }]);
      }
      if (url.endsWith("/v1/connections")) {
        return Response.json({ connectionId: "conn-1" });
      }
      return Response.json({ jobId: 91, status: "pending", jobType: "sync" });
    };
    const adapter = new AirbyteHttpAdapter({ token: "top-secret", fetchImpl });

    const connection = await adapter.createConnection({
      sourceId: "source-1",
      destinationId: "destination-1",
      name: "GA4 · Acme",
      namespace: "raw_ws_ab12",
      streamNames: ["pages"],
    });
    const job = await adapter.triggerSync(connection.connectionId);

    assert.equal(job.jobId, 91);
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /^https:\/\/api\.airbyte\.com\/v1\/streams\?/u);
    assert.equal(calls[1].url, "https://api.airbyte.com/v1/connections");
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
      sourceId: "source-1",
      destinationId: "destination-1",
      name: "GA4 · Acme",
      configurations: { streams: [{
        name: "pages", syncMode: "incremental_deduped_history", cursorField: ["date"],
        primaryKey: [["date"], ["page_location"]],
      }] },
      namespaceDefinition: "custom_format",
      namespaceFormat: "raw_ws_ab12",
      schedule: { scheduleType: "cron", cronExpression: "0 0 * * * ?" },
      nonBreakingSchemaUpdatesBehavior: "propagate_columns",
    });
    assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, "Bearer top-secret");
    assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { connectionId: "conn-1", jobType: "sync" });
  });

  it("does not expose tokens or raw provider errors", async () => {
    const fetchImpl: typeof fetch = async () => Response.json(
      { message: "invalid token top-secret for client@example.com", trace: "stack" },
      { status: 401 },
    );
    const adapter = new AirbyteHttpAdapter({ token: "top-secret", fetchImpl });
    await assert.rejects(() => adapter.getJob(123), /Airbyte 요청을 처리하지 못했습니다/u);
    assert.equal(sanitizeProviderError("Bearer abc.def.ghi invalid for client@example.com"), "외부 데이터 공급자 요청이 실패했습니다.");
  });

  it("detects an active job before a manual sync", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = async () => Response.json({
      data: [{ jobId: 7, status: "running", jobType: "sync" }],
    });
    const adapter = new AirbyteHttpAdapter({ token: "token", fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      return fetchImpl(input, init);
    } });
    assert.equal(await adapter.hasActiveJob("conn-1"), true);
    assert.equal(new URL(requestedUrl).searchParams.get("status"), null);
  });

  it("lists scheduled sync jobs for cron discovery", async () => {
    let requestedUrl = "";
    const adapter = new AirbyteHttpAdapter({ token: "token", fetchImpl: async (input) => {
      requestedUrl = String(input);
      return Response.json({ data: [{ jobId: 71, status: "succeeded", rowsSynced: 120 }] });
    } });
    const jobs = await adapter.listJobs("conn-1", 5);
    assert.equal(jobs[0].jobId, 71);
    const params = new URL(requestedUrl).searchParams;
    assert.equal(params.get("connectionId"), "conn-1");
    assert.equal(params.get("jobType"), "sync");
    assert.equal(params.get("limit"), "5");
  });

  it("refuses to create a connection when a selected stream cannot deduplicate", async () => {
    const adapter = new AirbyteHttpAdapter({ token: "token", fetchImpl: async () => Response.json([{
      streamName: "pages", syncModes: ["full_refresh_overwrite"],
    }]) });
    await assert.rejects(() => adapter.createConnection({
      sourceId: "source-1", destinationId: "destination-1", name: "GA4",
      namespace: "raw_abcdef12", streamNames: ["pages"],
    }), /incremental deduped validation/u);
  });
});
