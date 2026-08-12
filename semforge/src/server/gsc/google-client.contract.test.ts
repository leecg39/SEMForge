// @TASK P2-G1-T1 - Google Search Console REST adapter contract
// @SPEC user-approved-plan#인증과-GSC
// @TEST src/server/gsc/google-client.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createGoogleSearchConsoleClient,
} from "@/server/gsc/google-client";

test("Search Console sites.list는 공식 REST endpoint와 Bearer access token만 사용한다", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const client = createGoogleSearchConsoleClient({
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({
        siteEntry: [
          { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
          { siteUrl: "https://www.example.com/", permissionLevel: "siteFullUser" },
        ],
      });
    },
  });

  const properties = await client.listSites("ya29.access-token-secret");

  assert.deepEqual(properties, [
    { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
    { siteUrl: "https://www.example.com/", permissionLevel: "siteFullUser" },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://www.googleapis.com/webmasters/v3/sites");
  assert.deepEqual(calls[0]!.init?.headers, {
    accept: "application/json",
    authorization: "Bearer ya29.access-token-secret",
  });
});

test("토큰 revoke는 공식 OAuth revoke endpoint에 form body로 전송하고 비밀값을 오류에 노출하지 않는다", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const client = createGoogleSearchConsoleClient({
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response("", { status: 500 });
    },
  });

  await assert.rejects(
    client.revokeToken("refresh-token-secret"),
    (error: unknown) => error instanceof Error && !error.message.includes("refresh-token-secret"),
  );

  assert.equal(calls[0]!.url, "https://oauth2.googleapis.com/revoke");
  assert.equal(calls[0]!.init?.method, "POST");
  assert.equal((calls[0]!.init?.headers as Record<string, string>)["content-type"], "application/x-www-form-urlencoded");
  assert.equal(String(calls[0]!.init?.body), "token=refresh-token-secret");
});

test("400 invalid_token만 이미 만료·revoke된 token의 멱등 성공으로 정규화한다", async () => {
  const responses = [
    Response.json({ error: "invalid_token", error_description: "Token expired or revoked" }, { status: 400 }),
    Response.json({ error: "invalid_request", error_description: "Malformed request" }, { status: 400 }),
    Response.json({ error: "invalid_token" }, { status: 401 }),
    new Response(JSON.stringify({ error: "invalid_token", padding: "x".repeat(4_096) }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
  ];
  const client = createGoogleSearchConsoleClient({
    fetchImpl: async () => responses.shift()!,
  });

  await client.revokeToken("already-revoked-refresh-token");
  await assert.rejects(
    client.revokeToken("malformed-token"),
    (error: unknown) => error instanceof Error &&
      error.message === "Google Search Console request failed with HTTP 400.",
  );
  await assert.rejects(
    client.revokeToken("unauthorized-token"),
    (error: unknown) => error instanceof Error && error.message === "UNAUTHORIZED",
  );
  await assert.rejects(
    client.revokeToken("oversized-provider-response"),
    (error: unknown) => error instanceof Error &&
      error.message === "Google Search Console request failed with HTTP 400.",
  );
});
