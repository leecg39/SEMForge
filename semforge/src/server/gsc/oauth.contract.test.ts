// @TASK P2-G1-T1 - Google Search Console OAuth contract
// @SPEC user-approved-plan#인증과-GSC
// @TEST src/server/gsc/oauth.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GSC_SCOPE,
  buildGscAuthorizationUrl,
  hashOAuthState,
  newOAuthState,
  safeGscReturnPath,
} from "@/server/gsc/oauth";

test("Google OAuth URL은 Search Console readonly 단일 scope와 offline refresh 계약만 요청한다", () => {
  const state = "client-visible-state";
  const url = new URL(
    buildGscAuthorizationUrl({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      redirectUri: "https://semforge.example/api/v1/integrations/gsc/callback",
    }, state),
  );

  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "google-client-id");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://semforge.example/api/v1/integrations/gsc/callback",
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), GSC_SCOPE);
  assert.deepEqual(url.searchParams.getAll("scope"), [GSC_SCOPE]);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent select_account");
  assert.equal(url.searchParams.get("state"), state);
});

test("OAuth state는 32-byte random raw만 클라이언트에 주고 SHA-256 해시만 저장 대상으로 만든다", () => {
  const stateA = newOAuthState();
  const stateB = newOAuthState();

  assert.match(stateA, /^[A-Za-z0-9_-]{43}$/);
  assert.match(stateB, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(stateA, stateB);
  assert.match(hashOAuthState(stateA), /^[0-9a-f]{64}$/);
  assert.notEqual(hashOAuthState(stateA), stateA);
});

test("GSC callback returnPath는 allowlisted relative path로만 제한한다", () => {
  assert.equal(safeGscReturnPath("/app/settings"), "/app/settings");
  assert.equal(safeGscReturnPath("/app/sites/10000000-0000-4000-8000-000000000001"), "/app/sites/10000000-0000-4000-8000-000000000001");
  assert.equal(safeGscReturnPath("https://evil.example/app/settings"), "/app/settings");
  assert.equal(safeGscReturnPath("//evil.example/app/settings"), "/app/settings");
  assert.equal(safeGscReturnPath("/admin"), "/app/settings");
  assert.equal(safeGscReturnPath("/api/v1/integrations/gsc/callback"), "/app/settings");
});
