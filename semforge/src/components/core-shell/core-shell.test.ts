// @TASK P1-F1-T1 - SEMForge core shell render contracts
// @SPEC SEMForge paid beta plan#allowed-pages-and-core-shell
// @TEST This file
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./app-shell";
import { AuthForm, buildAuthPayload } from "./auth-form";
import { BrandMark } from "./brand-mark";
import {
  classifyApiEnvelope,
  DataEndpointBoundary,
  readApiEnvelope,
} from "./data-endpoint-boundary";
import { ProductLimitSummary } from "./product-limit-summary";
import { StatusPanel } from "./status-panel";
import { WorkspaceSettingsForm } from "./workspace-settings-form";

function render(node: React.ReactNode) {
  return renderToStaticMarkup(createElement("div", null, node));
}

test("BrandMark는 독립 SEMForge 이름과 주간 가시성 메시지만 제공한다", () => {
  const html = render(createElement(BrandMark));

  assert.match(html, /SEMForge/);
  assert.match(html, /주간 검색 가시성/);
  assert.doesNotMatch(html, /Semrush|클론|reverse.engineer/i);
});

test("AppShell은 허용된 핵심 앱 탐색과 모바일 탐색을 접근 가능하게 렌더링한다", () => {
  const html = render(
    createElement(
      AppShell,
      { active: "sites" },
      createElement("p", null, "페이지 본문"),
    ),
  );

  assert.match(html, /href="\/app"/);
  assert.match(html, /href="\/app\/sites"/);
  assert.match(html, /href="\/app\/reports"/);
  assert.match(html, /href="\/app\/billing"/);
  assert.match(html, /href="\/app\/settings"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-label="주요 탐색"/);
  assert.match(html, /aria-label="모바일 주요 탐색"/);
  assert.doesNotMatch(html, /백링크|사이트 감사|콘텐츠 생성|소셜/);
});

test("StatusPanel은 loading, error, empty, partial 상태를 숫자 조작 없이 구분한다", () => {
  const loading = render(createElement(StatusPanel, { status: "loading" }));
  const error = render(createElement(StatusPanel, { status: "error" }));
  const empty = render(createElement(StatusPanel, { status: "empty" }));
  const partial = render(createElement(StatusPanel, { status: "partial" }));

  assert.match(loading, /role="status"/);
  assert.match(loading, /데이터를 확인하고 있습니다/);
  assert.match(error, /role="alert"/);
  assert.match(error, /불러오지 못했습니다/);
  assert.match(empty, /첫 데이터를 준비해 주세요/);
  assert.match(partial, /일부 데이터만 확인되었습니다/);
  assert.doesNotMatch(`${loading}${error}${empty}${partial}`, /\d+%|₩|원 증가/);
});

test("ProductLimitSummary는 유료 베타의 실제 한도를 고정해 설명한다", () => {
  const html = render(createElement(ProductLimitSummary));

  assert.match(html, /워크스페이스당 사이트/);
  assert.match(html, />3</);
  assert.match(html, /Google 순위 키워드/);
  assert.match(html, /AI Overview 프롬프트/);
  assert.equal((html.match(/>20</g) ?? []).length, 2);
});

test("AuthForm은 인증 종류별 실제 API 경계를 form에 노출한다", () => {
  const login = render(createElement(AuthForm, { variant: "login" }));
  const invite = render(
    createElement(AuthForm, { variant: "invite", token: "invite-token" }),
  );
  const forgot = render(createElement(AuthForm, { variant: "forgot" }));
  const reset = render(
    createElement(AuthForm, { variant: "reset", token: "reset-token" }),
  );

  assert.match(login, /data-endpoint="\/api\/v1\/auth\/login"/);
  assert.match(invite, /data-endpoint="\/api\/v1\/auth\/invites\/accept"/);
  assert.match(forgot, /data-endpoint="\/api\/v1\/auth\/password\/forgot"/);
  assert.match(reset, /data-endpoint="\/api\/v1\/auth\/password\/reset"/);
  assert.match(login, /autoComplete="email"/);
  assert.match(login, /autoComplete="current-password"/);
  assert.doesNotMatch(`${login}${invite}`, /owner@example|password1234|시드 계정/);
});

test("인증 payload는 식별자 공백만 정리하고 비밀번호 원문은 보존한다", () => {
  const formData = new FormData();
  formData.set("email", "  agency@example.test  ");
  formData.set("password", "  passphrase with spaces  ");
  formData.set("passwordConfirmation", "  passphrase with spaces  ");

  assert.deepEqual(buildAuthPayload(formData, "invite-token"), {
    email: "agency@example.test",
    password: "  passphrase with spaces  ",
    token: "invite-token",
  });
});

test("API envelope 분류는 빈 데이터와 일부 데이터를 구분한다", () => {
  assert.equal(classifyApiEnvelope({ data: { items: [] }, error: null }), "empty");
  assert.equal(
    classifyApiEnvelope({ data: { items: [{ id: "site-1" }], partial: true }, error: null }),
    "partial",
  );
  assert.equal(
    classifyApiEnvelope({ data: { items: [{ id: "site-1" }] }, error: null }),
    "ready",
  );
  assert.equal(
    classifyApiEnvelope({ data: null, error: { code: "FAILED", message: "실패" } }),
    "error",
  );
});

test("DataEndpointBoundary는 실제 v1 endpoint를 로딩 상태에 표시한다", () => {
  const html = render(
    createElement(DataEndpointBoundary, {
      endpoint: "/api/v1/sites",
      resourceLabel: "사이트",
    }),
  );

  assert.match(html, /data-endpoint="\/api\/v1\/sites"/);
  assert.match(html, /데이터를 확인하고 있습니다/);
});

test("API 경계는 성공 상태의 비 JSON 응답을 빈 데이터로 오인하지 않는다", async () => {
  const envelope = await readApiEnvelope(
    new Response("<html>proxy error</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }),
    "사이트",
  );

  assert.deepEqual(envelope.error, {
    code: "MALFORMED_RESPONSE",
    message: "사이트 응답 형식을 확인하지 못했습니다.",
  });
  assert.equal(classifyApiEnvelope(envelope), "error");
});

test("WorkspaceSettingsForm은 워크스페이스 설정 API와 브랜드 입력을 연결한다", () => {
  const html = render(createElement(WorkspaceSettingsForm));

  assert.match(html, /data-endpoint="\/api\/v1\/settings\/workspace"/);
  assert.match(html, /name="agencyName"/);
  assert.match(html, /name="accentColor"/);
  assert.match(html, /type="url"/);
  assert.match(html, /로고 URL/);
});
