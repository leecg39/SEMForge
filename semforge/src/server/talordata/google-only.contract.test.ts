// @TASK P3-C1-T1 - TalorData Google organic/AIO-only public contract
// @SPEC docs/planning/06-tasks.md#p3-c1-t1--google-rank와-aio-수집
// @TEST src/server/talordata/google-only.contract.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as client from "@/server/talordata/client";

const productionSources = [
  new URL("./client.ts", import.meta.url),
  new URL("../providers/talordata/provider.ts", import.meta.url),
];

const prohibitedSurfaces = [
  {
    name: "Bing engine and parameters",
    pattern: /\bBing\b|["']bing["']|\bSerpEngine\b|\b(?:cc|mkt|latitude|longitude)\??:|body\.set\(["'](?:cc|mkt|lat|lon)["']/i,
  },
  {
    name: "paid ads and PPC",
    pattern: /\bPPC\b|\bpaid(?:Items|Results)?\b|\bSerp(?:Paid|Ad)|parsePaidResults|paidItemsFrom|top_ads|bottom_ads|ads_top|ads_bottom|ad_results|paid_results|search_ad|shopping_ad/i,
  },
  {
    name: "shopping and product results",
    pattern: /shopping|product_(?:link|title|results)|immersive_products|inline_products/i,
  },
  {
    name: "local pack and local results",
    pattern: /LocalResult|localResults|local_pack|local_results|snack_pack|\bplaces\b|\blocals\b/i,
  },
  {
    name: "non-organic/AIO SERP features",
    pattern: /FEATURE_KEYS|\bfeatures\b|knowledge_panel|answer_box|people_also_ask|people_are_saying|related_searches|refine_this_search|top_stories/i,
  },
] as const;

test("TalorData 공개 API는 Google organic과 AIO 수집 표면만 노출한다", () => {
  assert.deepEqual(Object.keys(client).sort(), [
    "RetryableTalordataError",
    "fetchSerp",
    "isRecord",
  ]);

  for (const sourceUrl of productionSources) {
    const source = readFileSync(sourceUrl, "utf8");
    for (const prohibited of prohibitedSurfaces) {
      assert.doesNotMatch(
        source,
        prohibited.pattern,
        `${sourceUrl.pathname} still exposes ${prohibited.name}`,
      );
    }
  }
});
