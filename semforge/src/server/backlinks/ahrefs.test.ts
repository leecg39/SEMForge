import assert from "node:assert/strict";
import { test } from "node:test";
import { AhrefsDomainRatingProvider, AHREFS_LICENSE_URL } from "@/server/backlinks/ahrefs";

test("Ahrefs 무료 DR을 Bearer 인증으로 읽고 라이선스 링크를 보존한다", async () => {
  let authorization = "";
  const provider = new AhrefsDomainRatingProvider({ apiKey: "secret", fetchImpl: async (_input, init) => {
    authorization = String((init?.headers as Record<string, string>).Authorization);
    return Response.json({ domain_rating: { domain_rating: 71.2, license: AHREFS_LICENSE_URL } });
  }});
  const result = await provider.get("example.com");
  assert.equal(result.value, 71.2); assert.equal(result.licenseUrl, AHREFS_LICENSE_URL); assert.equal(authorization, "Bearer secret");
});
