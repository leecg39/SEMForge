// @TASK P2-A1-T1 - Pure session cookie boundary
// @SPEC user-approved-plan#인증과-GSC
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  readSessionTokenFromCookieHeader,
  readSessionTokenFromCookieStore,
  readSessionTokenFromRequest,
  sessionCookieHeader,
  sessionCookieOptions,
  sessionDeletionCookieHeader,
  sessionDeletionCookieOptions,
} from "@/lib/session";

const NOW = new Date("2026-08-11T00:00:00.000Z");
const TOKEN = "a".repeat(43);

test("세션 쿠키 옵션은 30일 TTL·HttpOnly·SameSite=Lax·Path=/를 고정한다", () => {
  assert.equal(SESSION_COOKIE_NAME, "semforge_session");
  assert.equal(SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1_000);
  assert.deepEqual(sessionCookieOptions(NOW, false), {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    expires: new Date("2026-09-10T00:00:00.000Z"),
  });
  assert.equal(sessionCookieOptions(NOW, true).secure, true);
});

test("Set-Cookie 헤더는 production에서만 Secure를 포함한다", () => {
  const development = sessionCookieHeader(TOKEN, NOW, false);
  const production = sessionCookieHeader(TOKEN, NOW, true);

  assert.equal(
    development,
    `semforge_session=${TOKEN}; Path=/; Max-Age=2592000; Expires=Thu, 10 Sep 2026 00:00:00 GMT; HttpOnly; SameSite=Lax`,
  );
  assert.equal(production, `${development}; Secure`);

  const response = new Response(null, { headers: { "Set-Cookie": production } });
  assert.equal(response.headers.get("set-cookie"), production);
});

test("삭제 옵션과 헤더는 즉시 만료되며 production Secure 정책을 유지한다", () => {
  assert.deepEqual(sessionDeletionCookieOptions(true), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  assert.equal(
    sessionDeletionCookieHeader(false),
    "semforge_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
  );
});

test("Request Cookie 헤더에서 정확한 세션 쿠키만 읽는다", () => {
  const request = new Request("https://semforge.test/app", {
    headers: { cookie: `theme=dark; ${SESSION_COOKIE_NAME}=${TOKEN}; locale=ko` },
  });

  assert.equal(readSessionTokenFromRequest(request), TOKEN);
  assert.equal(readSessionTokenFromCookieHeader("other=value"), null);
  assert.equal(readSessionTokenFromCookieHeader(null), null);
});

test("중복·빈 값·손상된 세션 쿠키는 거부한다", () => {
  assert.equal(
    readSessionTokenFromCookieHeader(
      `${SESSION_COOKIE_NAME}=${TOKEN}; ${SESSION_COOKIE_NAME}=${"b".repeat(43)}`,
    ),
    null,
  );
  assert.equal(readSessionTokenFromCookieHeader(`${SESSION_COOKIE_NAME}=`), null);
  assert.equal(readSessionTokenFromCookieHeader(`${SESSION_COOKIE_NAME}=%E0%A4%A`), null);
});

test("Next 16의 async cookies() 결과도 프레임워크 타입 의존 없이 읽는다", async () => {
  const store = Promise.resolve({
    get(name: string) {
      return name === SESSION_COOKIE_NAME ? { value: TOKEN } : undefined;
    },
  });

  assert.equal(await readSessionTokenFromCookieStore(store), TOKEN);
  assert.equal(
    await readSessionTokenFromCookieStore(Promise.resolve({ get: () => undefined })),
    null,
  );
});

