import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

import {
  ApiError,
  apiSuccess,
  parseJsonBody,
  resolveRequestId,
  withApiV1,
} from "@/lib/api-v1";

const mutableEnv = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

test("auth guard는 공개 resolveRequestId로 안전한 ID만 재사용한다", () => {
  assert.equal(
    resolveRequestId(
      new Request("https://app.semforge.test/api/v1/auth/session", {
        headers: { "x-request-id": "request-guard-123" },
      })
    ),
    "request-guard-123"
  );
  assert.match(
    resolveRequestId(
      new Request("https://app.semforge.test/api/v1/auth/session", {
        headers: { "x-request-id": "unsafe guard id" },
      })
    ),
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/i
  );
});

test("성공 응답은 고정 envelope와 안전한 요청 ID를 반환한다", async () => {
  const handler = withApiV1(async () => apiSuccess({ ok: true }));
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/session", {
      headers: { "x-request-id": "request-1234.safe" },
    }),
    undefined
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "request-1234.safe");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await readJson(response), {
    data: { ok: true },
    error: null,
    requestId: "request-1234.safe",
  });
});

test("typed ApiError는 상태 코드와 오류 envelope로 변환된다", async () => {
  const handler = withApiV1(async () => {
    throw new ApiError("NOT_FOUND", "사이트를 찾을 수 없습니다.");
  });
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/sites/missing", {
      headers: { "x-request-id": "request-5678.safe" },
    }),
    undefined
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-request-id"), "request-5678.safe");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await readJson(response), {
    data: null,
    error: {
      code: "NOT_FOUND",
      message: "사이트를 찾을 수 없습니다.",
    },
    requestId: "request-5678.safe",
  });
});

test("RATE_LIMITED 오류는 정수 Retry-After와 canonical 응답 헤더를 반환한다", async () => {
  const handler = withApiV1(async () => {
    throw new ApiError("RATE_LIMITED", undefined, { retryAfterSeconds: 17 });
  });
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
        "x-request-id": "request-rate-123",
      },
      body: "{}",
    }),
    undefined
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "17");
  assert.equal(response.headers.get("x-request-id"), "request-rate-123");
  assert.equal(response.headers.get("content-type"), "application/json");
});

test("JSON 본문 파서는 application/json이 아닌 요청을 415로 거부한다", async () => {
  const handler = withApiV1(async (request) => {
    const body = await parseJsonBody(
      request,
      z.object({ email: z.email() })
    );
    return apiSuccess(body);
  });
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: "https://app.semforge.test",
      },
      body: "not-json",
    }),
    undefined
  );

  assert.equal(response.status, 415);
  assert.deepEqual((await readJson(response) as { error: unknown }).error, {
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "application/json 형식만 지원합니다.",
  });
});

test("상태 변경 요청은 cross-origin Origin을 handler 실행 전에 거부한다", async () => {
  let called = false;
  const handler = withApiV1(async () => {
    called = true;
    return apiSuccess({ ok: true });
  });
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/auth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.test",
      },
      body: "{}",
    }),
    undefined
  );

  assert.equal(called, false);
  assert.equal(response.status, 403);
  assert.deepEqual((await readJson(response) as { error: unknown }).error, {
    code: "FORBIDDEN",
    message: "요청 출처를 확인할 수 없습니다.",
  });
});

test("안전하지 않은 요청 ID는 UUID로 교체하고 handler와 응답에 동일하게 전달한다", async () => {
  let handlerRequestId = "";
  const handler = withApiV1(async (_request, _context, apiContext) => {
    handlerRequestId = apiContext.requestId;
    return apiSuccess(null);
  });
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/session", {
      headers: { "x-request-id": "unsafe request id" },
    }),
    undefined
  );
  const payload = await readJson(response) as { requestId: string };

  assert.match(handlerRequestId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  assert.equal(response.headers.get("x-request-id"), handlerRequestId);
  assert.equal(payload.requestId, handlerRequestId);
});

test("성공 응답의 Set-Cookie는 보존하고 임의 x-request-id는 덮어쓴다", async () => {
  const handler = withApiV1(async () =>
    apiSuccess(
      { authenticated: true },
      {
        status: 201,
        headers: {
          "cache-control": "public, max-age=3600",
          "content-type": "text/html",
          "set-cookie": "session=opaque; Path=/; HttpOnly; Secure; SameSite=Lax",
          "x-request-id": "forged-response-id",
        },
      }
    )
  );
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/session", {
      headers: { "x-request-id": "request-cookie-123" },
    }),
    undefined
  );

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-request-id"), "request-cookie-123");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.match(response.headers.get("set-cookie") ?? "", /session=opaque/);
});

test("예상하지 못한 오류는 메시지와 비밀값을 숨긴 500 envelope로 변환한다", async () => {
  const handler = withApiV1(async () => {
    throw new Error("DATABASE_URL=postgres://user:secret@example.test/db");
  });
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/session"),
    undefined
  );
  const payload = await readJson(response);
  const serialized = JSON.stringify(payload);

  assert.equal(response.status, 500);
  assert.match(serialized, /INTERNAL/);
  assert.match(serialized, /일시적인 오류/);
  assert.doesNotMatch(serialized, /DATABASE_URL|postgres|secret/);
});

test("INTERNAL ApiError의 사용자 지정 메시지도 외부에 노출하지 않는다", async () => {
  const handler = withApiV1(async () => {
    throw new ApiError("INTERNAL", "refresh_token=private-value", {
      fields: { token: "refresh_token=another-private-value" },
    });
  });
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/session"),
    undefined
  );
  const serialized = JSON.stringify(await readJson(response));

  assert.equal(response.status, 500);
  assert.doesNotMatch(serialized, /refresh_token|private-value|token/);
});

test("apiSuccess는 JSON 본문을 허용하지 않는 성공 status를 런타임에도 거부한다", () => {
  assert.throws(
    () => Reflect.apply(apiSuccess, undefined, [null, { status: 204 }]),
    /API 성공 상태 코드/
  );
});

test("깨진 JSON은 400, 스키마 불일치는 422와 필드 오류를 반환한다", async (t) => {
  const schema = z.object({ email: z.email(), password: z.string().min(8) });
  const handler = withApiV1(async (request) =>
    apiSuccess(await parseJsonBody(request, schema))
  );

  await t.test("malformed JSON", async () => {
    const response = await handler(
      new Request("https://app.semforge.test/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          origin: "https://app.semforge.test",
        },
        body: "{",
      }),
      undefined
    );
    const payload = await readJson(response) as {
      error: { code: string; message: string };
    };

    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "BAD_REQUEST");
    assert.match(payload.error.message, /올바른 JSON/);
  });

  await t.test("schema mismatch", async () => {
    const response = await handler(
      new Request("https://app.semforge.test/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.semforge.test",
        },
        body: JSON.stringify({ email: "invalid", password: "short" }),
      }),
      undefined
    );
    const payload = await readJson(response) as {
      error: { code: string; fields: Record<string, string> };
    };

    assert.equal(response.status, 422);
    assert.equal(payload.error.code, "VALIDATION_ERROR");
    assert.ok(payload.error.fields.email);
    assert.ok(payload.error.fields.password);
  });
});

test("정상 JSON은 Zod 변환 결과를 handler에 전달한다", async () => {
  const handler = withApiV1(async (request) => {
    const body = await parseJsonBody(
      request,
      z.object({ label: z.string().trim().min(1) })
    );
    return apiSuccess(body);
  });
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/sites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
      },
      body: JSON.stringify({ label: "  고객사  " }),
    }),
    undefined
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), {
    data: { label: "고객사" },
    error: null,
    requestId: response.headers.get("x-request-id"),
  });
});

test("Zod 필드 오류는 Object prototype과 같은 이름도 누락하지 않는다", async () => {
  const schema = z.object({
    ["toString"]: z.string(),
    ["constructor"]: z.string(),
    ["__proto__"]: z.string(),
  });
  const handler = withApiV1(async (request) =>
    apiSuccess(await parseJsonBody(request, schema))
  );
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/sites", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
      },
      body: JSON.stringify(
        Object.fromEntries([
          ["toString", 1],
          ["constructor", 2],
          ["__proto__", 3],
        ])
      ),
    }),
    undefined
  );
  const payload = await readJson(response) as {
    error: { fields: Record<string, string> };
  };

  assert.equal(response.status, 422);
  assert.deepEqual(Object.keys(payload.error.fields).sort(), [
    "__proto__",
    "constructor",
    "toString",
  ]);
});

test("비동기 Zod refine 실패도 500이 아닌 422로 변환한다", async () => {
  const schema = z.object({
    email: z.string().refine(async () => false, "허용되지 않은 이메일입니다."),
  });
  const handler = withApiV1(async (request) =>
    apiSuccess(await parseJsonBody(request, schema))
  );
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/auth/invite", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.semforge.test",
      },
      body: JSON.stringify({ email: "person@example.test" }),
    }),
    undefined
  );
  const payload = await readJson(response) as {
    error: { code: string; fields: Record<string, string> };
  };

  assert.equal(response.status, 422);
  assert.equal(payload.error.code, "VALIDATION_ERROR");
  assert.equal(payload.error.fields.email, "허용되지 않은 이메일입니다.");
});

test("Origin이 없거나 opaque/null이면 상태 변경 요청을 거부한다", async (t) => {
  const handler = withApiV1(async () => apiSuccess(null));
  for (const [name, origin] of [
    ["missing", undefined],
    ["opaque", "null"],
    ["malformed", "not-an-origin"],
  ] as const) {
    await t.test(name, async () => {
      const headers = new Headers({ "content-type": "application/json" });
      if (origin !== undefined) headers.set("origin", origin);
      const response = await handler(
        new Request("https://app.semforge.test/api/v1/auth/logout", {
          method: "POST",
          headers,
          body: "{}",
        }),
        undefined
      );
      assert.equal(response.status, 403);
    });
  }
});

test("위조된 forwarded host/proto로 canonical origin을 바꿀 수 없다", async () => {
  const handler = withApiV1(async () => apiSuccess({ ok: true }));
  const response = await handler(
    new Request("http://web:3000/api/v1/auth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "web:3000",
        origin: "https://attacker.test",
        "x-forwarded-host": "attacker.test",
        "x-forwarded-proto": "https",
      },
      body: "{}",
    }),
    undefined
  );

  assert.equal(response.status, 403);
});

test("Host가 canonical URL host와 다르면 상태 변경 요청을 거부한다", async () => {
  const handler = withApiV1(async () => apiSuccess({ ok: true }));
  const response = await handler(
    new Request("https://app.semforge.test/api/v1/auth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "attacker.test",
        origin: "https://app.semforge.test",
      },
      body: "{}",
    }),
    undefined
  );

  assert.equal(response.status, 403);
});

test("APP_PUBLIC_URL이 설정되면 Host-derived Request URL로 신뢰 origin을 오염시킬 수 없다", async () => {
  const previousPublicUrl = process.env.APP_PUBLIC_URL;
  process.env.APP_PUBLIC_URL = "https://app.semforge.test";
  try {
    const handler = withApiV1(async () => apiSuccess({ ok: true }));
    const response = await handler(
      new Request("https://attacker.test/api/v1/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "attacker.test",
          origin: "https://attacker.test",
        },
        body: "{}",
      }),
      undefined
    );

    assert.equal(response.status, 403);
  } finally {
    if (previousPublicUrl === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = previousPublicUrl;
  }
});

test("production 상태 변경 요청은 HTTPS trusted origin이 없으면 fail closed한다", async (t) => {
  const previousNodeEnv = mutableEnv.NODE_ENV;
  const previousPublicUrl = process.env.APP_PUBLIC_URL;
  mutableEnv.NODE_ENV = "production";
  try {
    const request = () =>
      new Request("https://app.semforge.test/api/v1/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "app.semforge.test",
          origin: "https://app.semforge.test",
        },
        body: "{}",
      });

    await t.test("missing APP_PUBLIC_URL", async () => {
      delete mutableEnv.APP_PUBLIC_URL;
      const handler = withApiV1(async () => apiSuccess(null));
      assert.equal((await handler(request(), undefined)).status, 403);
    });

    await t.test("HTTP APP_PUBLIC_URL", async () => {
      process.env.APP_PUBLIC_URL = "http://app.semforge.test";
      const handler = withApiV1(async () => apiSuccess(null));
      assert.equal((await handler(request(), undefined)).status, 403);
    });

    await t.test("explicit HTTPS trusted origin", async () => {
      delete process.env.APP_PUBLIC_URL;
      const handler = withApiV1(async () => apiSuccess(null), {
        trustedOrigin: "https://app.semforge.test",
      });
      assert.equal((await handler(request(), undefined)).status, 200);
    });
  } finally {
    if (previousNodeEnv === undefined) Reflect.deleteProperty(mutableEnv, "NODE_ENV");
    else mutableEnv.NODE_ENV = previousNodeEnv;
    if (previousPublicUrl === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = previousPublicUrl;
  }
});

test("읽기 요청과 명시적 외부 webhook 정책은 Origin 검증을 생략한다", async (t) => {
  await t.test("GET", async () => {
    const handler = withApiV1(async () => apiSuccess({ ok: true }));
    const response = await handler(
      new Request("https://app.semforge.test/api/v1/session"),
      undefined
    );
    assert.equal(response.status, 200);
  });

  await t.test("external webhook POST", async () => {
    const handler = withApiV1(
      async () => apiSuccess({ accepted: true }),
      { originPolicy: "external-webhook" }
    );
    const response = await handler(
      new Request("https://app.semforge.test/api/v1/webhooks/toss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      undefined
    );
    assert.equal(response.status, 200);
  });
});

test("Origin 정책 오타와 none을 사용한 상태 변경 요청은 fail closed한다", async (t) => {
  const request = () =>
    new Request("https://app.semforge.test/api/v1/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

  await t.test("runtime typo", async () => {
    const buildHandler: (
      request: Request,
      context: undefined
    ) => Promise<Response> = Reflect.apply(withApiV1, undefined, [
      async () => apiSuccess(null),
      { originPolicy: "same-orgin" },
    ]);
    assert.equal((await buildHandler(request(), undefined)).status, 500);
  });

  await t.test("none on POST", async () => {
    const handler = withApiV1(async () => apiSuccess(null), {
      originPolicy: "none",
    });
    assert.equal((await handler(request(), undefined)).status, 500);
  });
});
