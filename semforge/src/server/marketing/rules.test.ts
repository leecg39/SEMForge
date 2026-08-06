import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attributionKind,
  calculateKpis,
  classifyFreshness,
  normalizeMarketingUrl,
  pseudonymizeMarketingId,
} from "./rules";

describe("marketing intelligence rules", () => {
  it("joins pages with a canonical URL without leaking tracking parameters", () => {
    assert.equal(
      normalizeMarketingUrl("HTTPS://Example.COM:443/Guide/?utm_source=newsletter&gclid=secret&b=2&a=1#pricing"),
      "https://example.com/Guide?a=1&b=2",
    );
    assert.equal(normalizeMarketingUrl("http://EXAMPLE.com:80/"), "http://example.com/");
    assert.equal(normalizeMarketingUrl("not a url"), null);
  });

  it("uses the fixed 90 minute fresh and 24 hour stale windows", () => {
    const now = new Date("2026-08-06T10:00:00.000Z");
    assert.equal(classifyFreshness(new Date("2026-08-06T08:30:00.000Z"), now), "fresh");
    assert.equal(classifyFreshness(new Date("2026-08-06T08:29:59.999Z"), now), "stale");
    assert.equal(classifyFreshness(new Date("2026-08-05T10:00:00.000Z"), now), "stale");
    assert.equal(classifyFreshness(new Date("2026-08-05T09:59:59.999Z"), now), "expired");
  });

  it("labels deterministic, inferred and unmatched attribution separately", () => {
    assert.equal(attributionKind({ gclid: "abc", gscLandingMatch: true }), "confirmed");
    assert.equal(attributionKind({ utmSource: "newsletter" }), "confirmed");
    assert.equal(attributionKind({ explicitCampaignBinding: true }), "confirmed");
    assert.equal(attributionKind({ gscLandingMatch: true }), "inferred");
    assert.equal(attributionKind({}), "unattributed");
  });

  it("calculates ratios without presenting clicks/session as conversion", () => {
    assert.deepEqual(calculateKpis({ clicks: 80, sessions: 100, cost: 50000, conversions: 4, revenue: 125000 }), {
      clickSessionRatio: 1.25,
      cpa: 12500,
      roas: 2.5,
    });
    assert.deepEqual(calculateKpis({ clicks: 0, sessions: 0, cost: 0, conversions: 0, revenue: 0 }), {
      clickSessionRatio: null,
      cpa: null,
      roas: null,
    });
  });

  it("pseudonymizes CRM identifiers deterministically without retaining the original", () => {
    const first = pseudonymizeMarketingId("contact-123", "workspace-secret");
    const second = pseudonymizeMarketingId("contact-123", "workspace-secret");
    assert.equal(first, second);
    assert.notEqual(first, "contact-123");
    assert.match(first, /^[a-f0-9]{64}$/u);
  });
});
