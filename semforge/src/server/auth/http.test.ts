// @TASK P2-A1-T1 - Auth HTTP adapter behavior
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
// @TEST src/server/auth/http.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { SESSION_COOKIE_NAME } from "@/lib/session";
import { AuthServiceError } from "@/server/auth/contracts";
import {
  createAuthHttpHandlers,
  type AuthHttpDependencies,
  type AuthHttpService,
} from "@/server/auth/http";
import { currentLegalDocuments } from "@/server/privacy/legal-documents";

const NOW = new Date("2026-08-11T05:00:00.000Z");
const EXPIRES_AT = new Date("2026-09-10T05:00:00.000Z");
const RAW_SESSION_TOKEN = "s".repeat(43);
const RAW_INVITE_TOKEN = "i".repeat(43);
const RAW_RESET_TOKEN = "r".repeat(43);

const PRINCIPAL = {
  sessionId: "10000000-0000-4000-8000-000000000001",
  userId: "10000000-0000-4000-8000-000000000002",
  workspaceId: "10000000-0000-4000-8000-000000000003",
  email: "owner@example.com",
  displayName: "운영자",
  role: "owner" as const,
  expiresAt: EXPIRES_AT,
};

function service(overrides: Partial<AuthHttpService> = {}): AuthHttpService {
  return {
    async login() {
      return {
        token: RAW_SESSION_TOKEN,
        expiresAt: EXPIRES_AT,
        principal: PRINCIPAL,
      };
    },
    async acceptInvite() {
      return {
        token: RAW_SESSION_TOKEN,
        expiresAt: EXPIRES_AT,
        principal: PRINCIPAL,
      };
    },
    async logout() {
      return { revoked: true };
    },
    async getSession() {
      return PRINCIPAL;
    },
    async requestPasswordReset() {
      return { accepted: true as const };
    },
    async resetPassword() {
      return { reset: true as const };
    },
    ...overrides,
  };
}

function handlers(
  authService: AuthHttpService = service(),
  overrides: Partial<Omit<AuthHttpDependencies, "getService">> = {},
) {
  return createAuthHttpHandlers({
    getService: () => authService,
    now: () => NOW,
    production: false,
    ...overrides,
  });
}

function jsonRequest(path: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(`https://app.semforge.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.semforge.test",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function payload(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

function legalConsentBody() {
  const documents = currentLegalDocuments();
  return {
    legalAccepted: true,
    legalTermsVersion: documents.terms.version,
    legalTermsSha256: documents.terms.sha256,
    legalPrivacyVersion: documents.privacy.version,
    legalPrivacySha256: documents.privacy.sha256,
    legalPresentedAt: "2026-08-11T04:59:00.000Z",
  };
}

test("login은 same-origin JSON만 받고 raw session token을 쿠키에만 기록한다", async () => {
  let received: Parameters<AuthHttpService["login"]>[0] | undefined;
  const authService = service({
    async login(input) {
      received = input;
      return {
        token: RAW_SESSION_TOKEN,
        expiresAt: EXPIRES_AT,
        principal: PRINCIPAL,
      };
    },
  });
  const response = await handlers(authService).login(
    jsonRequest(
      "/api/v1/auth/login",
      { email: " OWNER@EXAMPLE.COM ", password: "correct-password" },
      {
        cookie: `${SESSION_COOKIE_NAME}=${"c".repeat(43)}`,
        "x-forwarded-for": "198.51.100.99",
        "x-real-ip": "203.0.113.10",
      },
    ),
    undefined,
  );
  const body = await payload(response);
  const serializedBody = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(received?.email, "owner@example.com");
  assert.equal(received?.currentSessionToken, "c".repeat(43));
  assert.match(String(received?.throttleKey), /^[a-f0-9]{64}$/u);
  assert.notEqual(received?.throttleKey, "198.51.100.99");
  assert.notEqual(received?.throttleKey, "203.0.113.10");
  assert.equal(JSON.stringify(received).includes("198.51.100.99"), false);
  assert.equal(JSON.stringify(received).includes("203.0.113.10"), false);
  assert.match(response.headers.get("set-cookie") ?? "", new RegExp(`${SESSION_COOKIE_NAME}=${RAW_SESSION_TOKEN}`));
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/);
  assert.match(response.headers.get("set-cookie") ?? "", /SameSite=Lax/);
  assert.doesNotMatch(serializedBody, new RegExp(RAW_SESSION_TOKEN));
  assert.deepEqual(body, {
    data: {
      principal: {
        ...PRINCIPAL,
        expiresAt: EXPIRES_AT.toISOString(),
      },
      expiresAt: EXPIRES_AT.toISOString(),
    },
    error: null,
    requestId: response.headers.get("x-request-id"),
  });
});

test("login throttleKey는 피해자 이메일만으로 고정되지 않고 클라이언트 신호를 해시한다", async () => {
  const received: string[] = [];
  const authService = service({
    async login(input) {
      received.push(String(input.throttleKey));
      return {
        token: RAW_SESSION_TOKEN,
        expiresAt: EXPIRES_AT,
        principal: PRINCIPAL,
      };
    },
  });

  await handlers(authService).login(
    jsonRequest(
      "/api/v1/auth/login",
      { email: "victim@example.com", password: "wrong-password" },
      { "user-agent": "attacker-a/1.0", "accept-language": "ko-KR" },
    ),
    undefined,
  );
  await handlers(authService).login(
    jsonRequest(
      "/api/v1/auth/login",
      { email: "victim@example.com", password: "wrong-password" },
      { "user-agent": "attacker-b/1.0", "accept-language": "ko-KR" },
    ),
    undefined,
  );

  assert.equal(received.length, 2);
  assert.match(received[0]!, /^[a-f0-9]{64}$/u);
  assert.match(received[1]!, /^[a-f0-9]{64}$/u);
  assert.notEqual(received[0], received[1]);
  assert.equal(received.some((key) => key.includes("victim@example.com")), false);
});

test("login throttleKey는 trusted proxy opt-in 없이는 spoofed forwarded IP를 무시한다", async () => {
  const received: string[] = [];
  const authService = service({
    async login(input) {
      received.push(String(input.throttleKey));
      return {
        token: RAW_SESSION_TOKEN,
        expiresAt: EXPIRES_AT,
        principal: PRINCIPAL,
      };
    },
  });
  const body = { email: "owner@example.com", password: "correct-password" };
  const commonHeaders = {
    "user-agent": "same-client/1.0",
    "accept-language": "ko-KR",
  };

  await handlers(authService).login(
    jsonRequest("/api/v1/auth/login", body, {
      ...commonHeaders,
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "198.51.100.2",
    }),
    undefined,
  );
  await handlers(authService).login(
    jsonRequest("/api/v1/auth/login", body, {
      ...commonHeaders,
      "x-forwarded-for": "203.0.113.1",
      "x-real-ip": "203.0.113.2",
    }),
    undefined,
  );
  await handlers(authService, { trustedProxyHeaders: true }).login(
    jsonRequest("/api/v1/auth/login", body, {
      ...commonHeaders,
      "x-forwarded-for": "203.0.113.1, 10.0.0.1",
      "x-real-ip": "203.0.113.2",
    }),
    undefined,
  );

  assert.equal(received.length, 3);
  assert.equal(received[0], received[1]);
  assert.notEqual(received[1], received[2]);
  assert.equal(received.some((key) => key.includes("203.0.113.1")), false);
});

test("login은 cross-origin 요청을 service 실행 전에 거부한다", async () => {
  let called = false;
  const authService = service({
    async login() {
      called = true;
      throw new Error("호출되면 안 됩니다.");
    },
  });
  const response = await handlers(authService).login(
    new Request("https://app.semforge.test/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.test",
      },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "correct-password",
      }),
    }),
    undefined,
  );

  assert.equal(called, false);
  assert.equal(response.status, 403);
  assert.equal((await payload(response)).data, null);
});

test("login은 JSON 형식과 schema 오류를 표준 envelope로 반환한다", async (t) => {
  await t.test("application/json이 아니면 415", async () => {
    const response = await handlers().login(
      new Request("https://app.semforge.test/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "https://app.semforge.test",
        },
        body: "owner@example.com",
      }),
      undefined,
    );
    const body = await payload(response) as { error?: { code?: string } };

    assert.equal(response.status, 415);
    assert.equal(body.error?.code, "UNSUPPORTED_MEDIA_TYPE");
  });

  await t.test("입력 schema가 맞지 않으면 422", async () => {
    const response = await handlers().login(
      jsonRequest("/api/v1/auth/login", { email: "invalid", password: "" }),
      undefined,
    );
    const body = await payload(response) as { error?: { code?: string } };

    assert.equal(response.status, 422);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
  });

  await t.test("server-only 필드는 public body에서 422", async () => {
    let called = false;
    const response = await handlers(service({
      async login() {
        called = true;
        throw new Error("호출되면 안 됩니다.");
      },
    })).login(
      jsonRequest("/api/v1/auth/login", {
        email: "owner@example.com",
        password: "correct-password",
        currentSessionToken: "x".repeat(43),
      }),
      undefined,
    );
    const body = await payload(response) as { error?: { code?: string } };

    assert.equal(called, false);
    assert.equal(response.status, 422);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
  });
});

test("invite 수락도 session token을 body에서 제거하고 cookie로만 반환한다", async () => {
  let received: Parameters<AuthHttpService["acceptInvite"]>[0] | undefined;
  const response = await handlers(service({
    async acceptInvite(input) {
      received = input;
      return {
        token: RAW_SESSION_TOKEN,
        expiresAt: EXPIRES_AT,
        principal: PRINCIPAL,
      };
    },
  })).acceptInvite(
    jsonRequest(
      "/api/v1/auth/invites/accept",
      {
        token: RAW_INVITE_TOKEN,
        email: "owner@example.com",
        password: "strong-password-1234",
        displayName: "운영자",
        ...legalConsentBody(),
      },
      { cookie: `${SESSION_COOKIE_NAME}=${"c".repeat(43)}` },
    ),
    undefined,
  );
  const serializedBody = JSON.stringify(await payload(response));

  assert.equal(response.status, 201);
  assert.equal(received?.currentSessionToken, "c".repeat(43));
  assert.match(response.headers.get("set-cookie") ?? "", new RegExp(`${SESSION_COOKIE_NAME}=${RAW_SESSION_TOKEN}`));
  assert.doesNotMatch(serializedBody, new RegExp(RAW_SESSION_TOKEN));
});

test("invite 수락 body의 server-only currentSessionToken은 거부한다", async () => {
  let called = false;
  const response = await handlers(service({
    async acceptInvite() {
      called = true;
      throw new Error("호출되면 안 됩니다.");
    },
  })).acceptInvite(
    jsonRequest("/api/v1/auth/invites/accept", {
      token: RAW_INVITE_TOKEN,
      email: "owner@example.com",
      password: "strong-password-1234",
      ...legalConsentBody(),
      currentSessionToken: "x".repeat(43),
    }),
    undefined,
  );

  assert.equal(called, false);
  assert.equal(response.status, 422);
});

test("logout은 현재 cookie를 revoke하고 삭제 cookie를 반환한다", async () => {
  let receivedToken: string | null | undefined;
  const authService = service({
    async logout(token) {
      receivedToken = token;
      return { revoked: true };
    },
  });
  const response = await handlers(authService).logout(
    jsonRequest(
      "/api/v1/auth/logout",
      {},
      { cookie: `${SESSION_COOKIE_NAME}=${RAW_SESSION_TOKEN}` },
    ),
    undefined,
  );

  assert.equal(receivedToken, RAW_SESSION_TOKEN);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", new RegExp(`${SESSION_COOKIE_NAME}=;`));
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("session GET은 Origin 없이 동작하고 인증되지 않은 요청에 401을 반환한다", async () => {
  const response = await handlers(service({
    async getSession() {
      return null;
    },
  })).session(
    new Request("https://app.semforge.test/api/v1/auth/session"),
    undefined,
  );
  const body = await payload(response) as { error?: { code?: string } };

  assert.equal(response.status, 401);
  assert.equal(body.error?.code, "UNAUTHENTICATED");
});

test("forgot password는 존재 여부와 무관한 202 응답만 반환한다", async () => {
  let received: Parameters<AuthHttpService["requestPasswordReset"]>[0] | undefined;
  const response = await handlers(service({
    async requestPasswordReset(input) {
      received = input;
      return { accepted: true };
    },
  })).forgotPassword(
    jsonRequest(
      "/api/v1/auth/password/forgot",
      { email: "unknown@example.com" },
      {
        "x-forwarded-for": "198.51.100.99",
        "x-real-ip": "203.0.113.20",
      },
    ),
    undefined,
  );

  assert.equal(response.status, 202);
  assert.match(String(received?.throttleKey), /^[a-f0-9]{64}$/u);
  assert.notEqual(received?.throttleKey, "198.51.100.99");
  assert.notEqual(received?.throttleKey, "203.0.113.20");
  assert.equal(JSON.stringify(received).includes("unknown@example.com"), true);
  assert.equal(JSON.stringify(received).includes("198.51.100.99"), false);
  assert.deepEqual((await payload(response)).data, { accepted: true });
});

test("reset password 성공은 기존 session cookie를 삭제한다", async () => {
  const response = await handlers().resetPassword(
    jsonRequest(
      "/api/v1/auth/password/reset",
      { token: RAW_RESET_TOKEN, password: "renewed-password-1234" },
      { cookie: `${SESSION_COOKIE_NAME}=${RAW_SESSION_TOKEN}` },
    ),
    undefined,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.deepEqual((await payload(response)).data, { reset: true });
});

test("RATE_LIMITED service 오류는 generic 429와 Retry-After로 변환된다", async () => {
  const response = await handlers(service({
    async login() {
      throw new AuthServiceError("RATE_LIMITED", "internal throttle detail", 17);
    },
  })).login(
    jsonRequest("/api/v1/auth/login", {
      email: "owner@example.com",
      password: "correct-password",
    }),
    undefined,
  );
  const body = await payload(response) as {
    error?: { code?: string; message?: string };
  };

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "17");
  assert.equal(body.error?.code, "RATE_LIMITED");
  assert.doesNotMatch(body.error?.message ?? "", /internal throttle detail/);
});

test("AuthServiceError는 route별 안전한 public 오류로 변환된다", async (t) => {
  await t.test("invalid credentials", async () => {
    const response = await handlers(service({
      async login() {
        throw new AuthServiceError(
          "INVALID_CREDENTIALS",
          "database-specific credential detail",
        );
      },
    })).login(
      jsonRequest("/api/v1/auth/login", {
        email: "owner@example.com",
        password: "incorrect-password",
      }),
      undefined,
    );

    assert.equal(response.status, 401);
    assert.doesNotMatch(JSON.stringify(await payload(response)), /database-specific/);
  });

  await t.test("invalid invite", async () => {
    const response = await handlers(service({
      async acceptInvite() {
        throw new AuthServiceError("INVALID_INVITE", "internal invite detail");
      },
    })).acceptInvite(
      jsonRequest("/api/v1/auth/invites/accept", {
        token: RAW_INVITE_TOKEN,
        email: "owner@example.com",
        password: "strong-password-1234",
        ...legalConsentBody(),
      }),
      undefined,
    );

    assert.equal(response.status, 400);
    assert.doesNotMatch(JSON.stringify(await payload(response)), /internal invite detail/);
  });

  await t.test("invalid new password", async () => {
    const response = await handlers(service({
      async acceptInvite() {
        throw new AuthServiceError("INVALID_PASSWORD", "internal policy detail");
      },
    })).acceptInvite(
      jsonRequest("/api/v1/auth/invites/accept", {
        token: RAW_INVITE_TOKEN,
        email: "owner@example.com",
        password: "weak-password",
        ...legalConsentBody(),
      }),
      undefined,
    );

    assert.equal(response.status, 422);
    assert.doesNotMatch(JSON.stringify(await payload(response)), /internal policy detail/);
  });

  await t.test("invalid password reset", async () => {
    const response = await handlers(service({
      async resetPassword() {
        throw new AuthServiceError(
          "INVALID_PASSWORD_RESET",
          "internal reset detail",
        );
      },
    })).resetPassword(
      jsonRequest("/api/v1/auth/password/reset", {
        token: RAW_RESET_TOKEN,
        password: "renewed-password-1234",
      }),
      undefined,
    );

    assert.equal(response.status, 400);
    assert.doesNotMatch(JSON.stringify(await payload(response)), /internal reset detail/);
  });

  await t.test("configuration error", async () => {
    const response = await handlers(service({
      async login() {
        throw new AuthServiceError(
          "AUTH_CONFIGURATION",
          "AUTH_DATABASE_URL=postgres://secret",
        );
      },
    })).login(
      jsonRequest("/api/v1/auth/login", {
        email: "owner@example.com",
        password: "correct-password",
      }),
      undefined,
    );
    const serialized = JSON.stringify(await payload(response));

    assert.equal(response.status, 500);
    assert.doesNotMatch(serialized, /AUTH_DATABASE_URL|postgres|secret/);
  });
});
