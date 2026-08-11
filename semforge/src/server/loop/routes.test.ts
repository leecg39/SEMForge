import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyStatus,
  isHardDenied,
  toRoutePath,
  usesPaidClient,
} from "@/server/loop/routes";

const APP = "/repo/semforge/src/app";

test("파일 경로를 trailingSlash 규칙에 맞는 URL 로 바꾼다", () => {
  assert.equal(toRoutePath(APP, `${APP}/page.tsx`), "/");
  assert.equal(toRoutePath(APP, `${APP}/pricing/page.tsx`), "/pricing/");
  assert.equal(toRoutePath(APP, `${APP}/api/psi/route.ts`), "/api/psi/");
  assert.equal(toRoutePath(APP, `${APP}/api/gbp/reviews/reply/route.ts`), "/api/gbp/reviews/reply/");
});

test("라우트 그룹 (app) 은 URL 에 나타나지 않는다", () => {
  assert.equal(toRoutePath(APP, `${APP}/(app)/analytics/overview/page.tsx`), "/analytics/overview/");
  assert.equal(toRoutePath(APP, `${APP}/(marketing)/(sub)/pricing/page.tsx`), "/pricing/");
});

test("동적 세그먼트가 든 라우트는 대상에서 제외한다", () => {
  // 실제 id 없이 호출할 수 없으므로 스모크 대상이 아니다.
  assert.equal(toRoutePath(APP, `${APP}/api/site-audits/[id]/run/route.ts`), null);
  assert.equal(toRoutePath(APP, `${APP}/campaigns/[...slug]/page.tsx`), null);
});

test("상태 코드는 핸들러 생존 여부 기준으로 분류한다", () => {
  assert.equal(classifyStatus(200).outcome, "OK");
  assert.equal(classifyStatus(204).outcome, "OK");
  assert.equal(classifyStatus(307).outcome, "OK_REDIRECT");
  assert.equal(classifyStatus(302).outcome, "OK_REDIRECT");
  // 인증 거절·메서드 불일치·검증 실패는 핸들러가 살아 있다는 증거다.
  assert.equal(classifyStatus(401).outcome, "OK_CLIENT");
  assert.equal(classifyStatus(405).outcome, "OK_CLIENT");
  assert.equal(classifyStatus(400).outcome, "OK_CLIENT");
});

test("404 와 5xx 만 실패로 센다", () => {
  assert.equal(classifyStatus(404).outcome, "FAIL");
  assert.equal(classifyStatus(500).outcome, "FAIL");
  assert.equal(classifyStatus(503).outcome, "FAIL");
  assert.match(classifyStatus(404).reason ?? "", /찾을 수 없/);
});

test("파괴적·예약수집 라우트는 하드 제외 목록에 있다", () => {
  assert.equal(isHardDenied("/api/cron/run-due/"), true);
  assert.equal(isHardDenied("/api/gsc/disconnect/"), true);
  assert.equal(isHardDenied("/api/auth/logout/"), true);
  assert.equal(isHardDenied("/api/home/monitored-domains/"), false);
});

test("실과금 클라이언트를 import 하는 소스를 감지한다", () => {
  assert.equal(usesPaidClient('import { collect } from "@/server/talordata/collect";'), true);
  assert.equal(usesPaidClient('import { firecrawlMapUrls } from "@/server/firecrawl/client";'), true);
  assert.equal(usesPaidClient('import { runPsi } from "@/server/psi/client";'), true);
  assert.equal(usesPaidClient('import { listFolders } from "@/server/home";'), false);
});
