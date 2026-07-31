import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "@/lib/api";
import {
  DOMAIN_DIAGNOSTIC_MAX_TEXT_BYTES,
  diagnoseAiVisibilityDomain,
  normalizeDiagnosticTarget,
  type DomainDiagnosticDependencies,
} from "@/server/ai-visibility/domain-diagnostic";

const PUBLIC_IPS = async () => ["93.184.216.34"];

function dependencies(
  fetcher: DomainDiagnosticDependencies["fetcher"],
  overrides: Partial<DomainDiagnosticDependencies> = {},
): DomainDiagnosticDependencies {
  return {
    fetcher,
    resolveHostname: PUBLIC_IPS,
    now: () => new Date("2026-07-31T05:00:00.000Z"),
    ...overrides,
  };
}

test("도메인 입력을 공개 origin으로 정규화한다", () => {
  assert.deepEqual(normalizeDiagnosticTarget("Example.COM"), {
    domain: "example.com",
    origin: "https://example.com",
  });
  assert.deepEqual(normalizeDiagnosticTarget("http://example.com/"), {
    domain: "example.com",
    origin: "http://example.com",
  });
});

test("경로·자격증명·비표준 포트·내부 IP 입력을 거부한다", () => {
  for (const input of [
    "https://example.com/path",
    "https://user:secret@example.com",
    "https://example.com:8443",
    "http://127.0.0.1",
    "http://[::1]",
  ]) {
    assert.throws(
      () => normalizeDiagnosticTarget(input),
      (error) => error instanceof ApiError && error.code === "VALIDATION_ERROR",
      input,
    );
  }
});

test("robots.txt와 llms.txt를 병렬 수집해 순수 진단 결과를 한 보고서로 묶는다", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: DomainDiagnosticDependencies["fetcher"] = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/robots.txt")) {
      return new Response("User-agent: GPTBot\nDisallow: /", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(
      "# Example\n\n> 공식 문서\n\n## Docs\n- [Guide](https://example.com/guide): 시작 안내",
      { status: 200, headers: { "content-type": "text/markdown; charset=utf-8" } },
    );
  };

  const report = await diagnoseAiVisibilityDomain(
    "example.com",
    dependencies(fetcher),
  );

  assert.equal(report.domain, "example.com");
  assert.equal(report.origin, "https://example.com");
  assert.equal(report.checkedAt, "2026-07-31T05:00:00.000Z");
  assert.equal(report.robotsTxt.status, "fetched");
  assert.equal(report.robotsTxt.httpStatus, 200);
  assert.equal(report.robotsTxt.assessment?.summary.blockedCount, 1);
  assert.equal(report.llmsTxt.status, "fetched");
  assert.equal(report.llmsTxt.assessment?.isLlmsTxt, true);
  assert.equal(report.llmsTxt.assessment?.grade, "A");
  assert.equal("body" in report.robotsTxt, false);
  assert.equal("body" in report.llmsTxt, false);
  assert.deepEqual(
    calls.map(({ url }) => url).toSorted(),
    ["https://example.com/llms.txt", "https://example.com/robots.txt"],
  );
  assert.equal(calls.every(({ init }) => init.redirect === "manual"), true);
  assert.equal(
    calls.every(({ init }) => new Headers(init.headers).get("user-agent")?.includes("SEMForge")),
    true,
  );
});

test("404는 robots.txt 기본 허용과 llms.txt 부재를 구분해 반환한다", async () => {
  const fetcher: DomainDiagnosticDependencies["fetcher"] = async () =>
    new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });

  const report = await diagnoseAiVisibilityDomain(
    "example.com",
    dependencies(fetcher),
  );

  assert.equal(report.robotsTxt.status, "not-found");
  assert.equal(report.robotsTxt.assessment?.robotsStatus, "not-found");
  assert.equal(report.robotsTxt.assessment?.summary.blockedCount, 0);
  assert.equal(report.llmsTxt.status, "not-found");
  assert.equal(report.llmsTxt.assessment, null);
});

test("한 리소스의 네트워크 실패가 다른 리소스의 실측 결과를 지우지 않는다", async () => {
  const fetcher: DomainDiagnosticDependencies["fetcher"] = async (url) => {
    if (url.endsWith("/robots.txt")) throw new TypeError("socket closed");
    return new Response("# Example\n\n## Docs\n- [Guide](https://example.com/guide)", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  };

  const report = await diagnoseAiVisibilityDomain(
    "example.com",
    dependencies(fetcher),
  );

  assert.equal(report.robotsTxt.status, "error");
  assert.equal(report.robotsTxt.errorCode, "network");
  assert.equal(report.robotsTxt.assessment, null);
  assert.equal(report.llmsTxt.status, "fetched");
  assert.equal(report.llmsTxt.assessment?.isLlmsTxt, true);
});

test("내부망으로 향하는 리다이렉트를 따라가지 않는다", async () => {
  const calls: string[] = [];
  const fetcher: DomainDiagnosticDependencies["fetcher"] = async (url) => {
    calls.push(url);
    if (url.endsWith("/robots.txt")) {
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
      });
    }
    return new Response("not found", { status: 404 });
  };

  const report = await diagnoseAiVisibilityDomain(
    "example.com",
    dependencies(fetcher),
  );

  assert.equal(report.robotsTxt.status, "error");
  assert.equal(report.robotsTxt.errorCode, "unsafe-url");
  assert.equal(calls.includes("http://127.0.0.1/admin"), false);
});

test("공개 호스트명이 사설 IP로 해석되면 네트워크 요청 전에 차단한다", async () => {
  let fetchCount = 0;
  const fetcher: DomainDiagnosticDependencies["fetcher"] = async () => {
    fetchCount += 1;
    return new Response("unexpected");
  };

  const report = await diagnoseAiVisibilityDomain(
    "example.com",
    dependencies(fetcher, { resolveHostname: async () => ["10.0.0.8"] }),
  );

  assert.equal(fetchCount, 0);
  assert.equal(report.robotsTxt.errorCode, "unsafe-url");
  assert.equal(report.llmsTxt.errorCode, "unsafe-url");
});

test("용량 제한을 넘는 문서는 일부 본문으로 진단하지 않고 오류로 반환한다", async () => {
  const fetcher: DomainDiagnosticDependencies["fetcher"] = async () =>
    new Response("ignored", {
      status: 200,
      headers: {
        "content-type": "text/plain",
        "content-length": String(DOMAIN_DIAGNOSTIC_MAX_TEXT_BYTES + 1),
      },
    });

  const report = await diagnoseAiVisibilityDomain(
    "example.com",
    dependencies(fetcher),
  );

  assert.equal(report.robotsTxt.status, "error");
  assert.equal(report.robotsTxt.errorCode, "too-large");
  assert.equal(report.robotsTxt.assessment, null);
  assert.equal(report.llmsTxt.status, "error");
  assert.equal(report.llmsTxt.errorCode, "too-large");
});
