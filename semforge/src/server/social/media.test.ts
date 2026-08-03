import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_SECRET = "social-test-secret-at-least-long-enough";

test("공개 이미지 토큰은 자산·만료를 서명하고 변조와 만료를 거부한다", async () => {
  const { createSocialMediaToken, verifySocialMediaToken } =
    await import("./media");
  const token = createSocialMediaToken(
    "asset-1",
    Math.floor(Date.now() / 1000) + 30,
  );
  assert.equal(verifySocialMediaToken(token).assetId, "asset-1");
  assert.throws(
    () => verifySocialMediaToken(`${token.slice(0, -1)}x`),
    /찾을 수 없습니다/u,
  );
  const expired = createSocialMediaToken(
    "asset-1",
    Math.floor(Date.now() / 1000) - 1,
  );
  assert.throws(() => verifySocialMediaToken(expired), /만료/u);
});

test("공개 기반 URL은 HTTPS만 허용한다", async () => {
  const { socialPublicBaseUrl } = await import("./media");
  process.env.APP_PUBLIC_URL = "http://localhost:3000";
  assert.equal(socialPublicBaseUrl(), null);
  process.env.APP_PUBLIC_URL = "https://social.example.test/path";
  assert.equal(socialPublicBaseUrl(), "https://social.example.test");
});
