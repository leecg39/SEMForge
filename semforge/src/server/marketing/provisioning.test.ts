import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { connectorConfiguration, opaqueRawNamespace, postgresDestinationConfiguration } from "./provisioning";

describe("Airbyte provisioning configuration", () => {
  it("creates an opaque and deterministic tenant namespace", () => {
    const namespace = opaqueRawNamespace("workspace-customer-name", "secret-material");
    assert.match(namespace, /^raw_[a-f0-9]{16}$/u);
    assert.equal(namespace.includes("customer"), false);
    assert.equal(namespace, opaqueRawNamespace("workspace-customer-name", "secret-material"));
  });

  it("maps each connector without putting OAuth tokens in configuration", () => {
    assert.deepEqual(connectorConfiguration("gsc", "sc-domain:example.com"), {
      sourceType: "google-search-console", site_urls: ["sc-domain:example.com"], start_date: "2024-01-01",
    });
    assert.deepEqual(connectorConfiguration("ga4", "properties/123"), {
      sourceType: "google-analytics-data-api", property_ids: ["properties/123"], start_date: "2024-01-01",
    });
  });

  it("converts the analytics URL for Airbyte without persisting it locally", () => {
    assert.deepEqual(postgresDestinationConfiguration("postgresql://reader:p%40ss@db.example.com:5433/analytics?sslmode=require"), {
      destinationType: "postgres", host: "db.example.com", port: 5433, database: "analytics",
      username: "reader", password: "p@ss", schema: "airbyte_internal", ssl_mode: { mode: "require" },
    });
  });
});
