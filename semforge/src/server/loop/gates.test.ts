import assert from "node:assert/strict";
import { test } from "node:test";
import { overallStatus, skippedGate, tailOf, type GateResult } from "@/server/loop/gates";

function gate(name: string, status: GateResult["status"]): GateResult {
  return { name, command: `npm run ${name}`, status, exitCode: null, durationMs: 0, reason: null, tail: [] };
}

test("실패한 게이트가 하나라도 있으면 종합은 FAIL 이다", () => {
  assert.equal(overallStatus([gate("lint", "PASS"), gate("test", "FAIL")]), "FAIL");
  assert.equal(overallStatus([gate("lint", "FAIL"), gate("build", "NOT_RUN")]), "FAIL");
});

test("실패가 없고 통과가 하나라도 있으면 PASS 이다", () => {
  assert.equal(overallStatus([gate("lint", "PASS"), gate("build", "NOT_RUN")]), "PASS");
});

test("실행된 게이트가 하나도 없으면 PASS 가 아니라 NOT_RUN 이다", () => {
  // 아무것도 돌리지 못한 실행을 통과로 보고하면 안 된다.
  assert.equal(overallStatus([gate("lint", "NOT_RUN"), gate("test", "NOT_RUN")]), "NOT_RUN");
  assert.equal(overallStatus([]), "NOT_RUN");
});

test("tailOf 는 빈 줄을 버리고 마지막 N줄만 남긴다", () => {
  const lines = Array.from({ length: 30 }, (_, index) => `line-${index}`).join("\n");
  const result = tailOf(lines, null);
  assert.equal(result.length, 12);
  assert.equal(result.at(-1), "line-29");
  assert.equal(result[0], "line-18");
});

test("tailOf 는 stdout 과 stderr 를 합치고 공백 줄을 제거한다", () => {
  assert.deepEqual(tailOf("out\n\n  \n", "err  "), ["out", "err"]);
  assert.deepEqual(tailOf(null, null), []);
});

test("skippedGate 는 NOT_RUN 과 사유를 함께 남긴다", () => {
  const result = skippedGate("build", "npm run build", "dev 서버와 충돌");
  assert.equal(result.status, "NOT_RUN");
  assert.equal(result.reason, "dev 서버와 충돌");
  assert.equal(result.exitCode, null);
  assert.equal(result.durationMs, 0);
});
