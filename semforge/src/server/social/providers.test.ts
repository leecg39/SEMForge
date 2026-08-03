import assert from "node:assert/strict";
import test from "node:test";
import type { AuthContext } from "@/lib/session";

const auth: AuthContext = {
  userId: "u",
  email: "u@test",
  name: "u",
  workspaceId: "w",
  workspaceName: "w",
  workspacePlan: "pro",
  role: "owner",
  sessionId: "s",
  ip: null,
  userAgent: null,
};
process.env.META_GRAPH_API_VERSION = "v23.0";

test("Facebook 게시 성공은 외부 게시 ID를 보존한다", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: "page_123" });
  try {
    const { socialProvider } = await import("./providers");
    const result = await socialProvider("facebook_page").publish({
      auth,
      platform: "facebook_page",
      externalId: "page",
      parentExternalId: null,
      accessToken: "token",
      text: "게시",
      linkUrl: null,
      publicImageUrl: null,
      idempotencyKey: "key",
    });
    assert.equal(result.externalPostId, "page_123");
  } finally {
    globalThis.fetch = original;
  }
});

test("Meta 429는 재시도 가능한 공급자 오류로 정규화한다", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ error: { message: "rate", code: 4 } }, { status: 429 });
  try {
    const { socialProvider } = await import("./providers");
    await assert.rejects(
      () =>
        socialProvider("facebook_page").publish({
          auth,
          platform: "facebook_page",
          externalId: "page",
          parentExternalId: null,
          accessToken: "token",
          text: "게시",
          linkUrl: null,
          publicImageUrl: null,
          idempotencyKey: "key",
        }),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === "object" &&
          (error as { code?: string }).code === "rate_limited" &&
          (error as { retryable?: boolean }).retryable,
        ),
    );
  } finally {
    globalThis.fetch = original;
  }
});
