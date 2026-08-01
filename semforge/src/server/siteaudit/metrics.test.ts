import assert from "node:assert/strict";
import test from "node:test";
import {
  coreWebVitalsPassRate,
  metricDeltas,
  metricValues,
} from "@/server/siteaudit/metrics";

test("Core Web Vitals pass rate uses only available core metrics", () => {
  assert.equal(
    coreWebVitalsPassRate({ source: "field", lcpMs: 2400, cls: 0.12, inpMs: 180 }),
    67
  );
  assert.equal(coreWebVitalsPassRate({ source: "none" }), null);
});

test("unmeasurable themes and missing PSI stay null", () => {
  const values = metricValues({
    crawledPages: 10,
    siteHealth: 80,
    errorCount: 2,
    warningCount: 3,
    themes: [
      { key: "crawlability", score: 90, measurable: true },
      { key: "internationalSeo", score: null, measurable: false },
    ],
    psi: null,
  });
  assert.equal(values.crawlability, 90);
  assert.equal(values.internationalSeo, null);
  assert.equal(values.performance, null);
  assert.equal(values.coreWebVitals, null);
});

test("first run deltas are unavailable and later deltas are exact", () => {
  const current = metricValues({
    crawledPages: 12,
    siteHealth: 90,
    errorCount: 1,
    warningCount: 4,
    themes: [{ key: "https", score: 100, measurable: true }],
    psi: null,
  });
  assert.equal(metricDeltas(current, null).siteHealth, null);
  const previous = { ...current, crawledPages: 10, siteHealth: 80, errors: 3 };
  const delta = metricDeltas(current, previous);
  assert.equal(delta.crawledPages, 2);
  assert.equal(delta.siteHealth, 10);
  assert.equal(delta.errors, -2);
});
