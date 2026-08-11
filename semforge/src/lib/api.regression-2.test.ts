import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, parseFormData } from "@/lib/api";

// Regression: ISSUE-013 — 업로드 라우트가 폼이 아닌 본문에 500 을 반환
// request.formData() 를 콘텐츠 타입 검증 없이 호출해 TypeError 가 route() 까지
// 전파되고, 클라이언트는 "일시적인 오류... 다시 시도해 주세요" (INTERNAL) 를 받았다.
// 재시도해도 절대 성공하지 않는 입력 오류를 일시적 장애로 안내하던 문제.
// Found by /qa on 2026-08-08
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-08.md
// 영향 라우트: analytics/backlinks/import/preview, content/brand-kit/logo, social/media

test("폼이 아닌 콘텐츠 타입은 400 VALIDATION_ERROR 로 거부한다", async () => {
  const request = new Request("https://semforge.test/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const error = await parseFormData(request).then(
    () => null,
    (reason: unknown) => reason
  );

  assert.ok(error instanceof ApiError, "ApiError 가 던져져야 한다");
  assert.equal(error.code, "VALIDATION_ERROR");
  assert.equal(error.status, 400);
  assert.doesNotMatch(error.message, /일시적인 오류/);
});

test("콘텐츠 타입이 없는 본문도 500 이 아니라 400 으로 거부한다", async () => {
  const request = new Request("https://semforge.test/api/upload", {
    method: "POST",
    body: "raw-bytes",
    headers: { "Content-Type": "text/plain" },
  });

  const error = await parseFormData(request).then(
    () => null,
    (reason: unknown) => reason
  );

  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 400);
});

test("깨진 multipart 본문은 500 이 아니라 400 으로 거부한다", async () => {
  const request = new Request("https://semforge.test/api/upload", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=----abc" },
    body: "완결되지 않은 멀티파트 본문",
  });

  const error = await parseFormData(request).then(
    () => null,
    (reason: unknown) => reason
  );

  assert.ok(error instanceof ApiError, "깨진 폼 본문도 ApiError 여야 한다");
  assert.equal(error.status, 400);
});

test("정상 multipart 요청은 폼 데이터를 그대로 통과시킨다", async () => {
  const form = new FormData();
  form.set("file", new File(["url,anchor\n"], "backlinks.csv", { type: "text/csv" }));
  const request = new Request("https://semforge.test/api/upload", {
    method: "POST",
    body: form,
  });

  const parsed = await parseFormData(request);
  const file = parsed.get("file");

  assert.ok(file instanceof File);
  assert.equal(file.name, "backlinks.csv");
});
