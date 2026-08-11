// @TASK P4-F1-T1 - Allowed live page render contracts
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST This file
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LandingPage from "@/app/page";
import LoginPage from "@/app/login/page";
import AppOverviewPage from "@/app/app/page";
import SitesPage from "@/app/app/sites/page";
import ReportsPage from "@/app/app/reports/page";
import BillingPage from "@/app/app/billing/page";
import SettingsPage from "@/app/app/settings/page";

function render(Component: React.ComponentType) {
  return renderToStaticMarkup(createElement(Component));
}

test("공개 홈은 주간 검색 가시성 제품과 초대 전용 베타를 설명한다", () => {
  const html = render(LandingPage);

  assert.match(html, /이번 주 검색 가시성/);
  assert.match(html, /Google 순위/);
  assert.match(html, /AI Overview/);
  assert.match(html, /NAVER/);
  assert.match(html, /초대 전용/);
  assert.doesNotMatch(html, /Semrush|무료 체험|경쟁사 분석|백링크/i);
});

test("로그인 페이지는 데모 계정 없이 인증 폼을 제공한다", () => {
  const html = render(LoginPage);

  assert.match(html, /계정에 로그인/);
  assert.match(html, /\/api\/v1\/auth\/login/);
  assert.doesNotMatch(html, /owner@example|password1234|시드 계정/);
});

test("앱 개요는 실제 사이트·리포트·GSC API를 함께 확인하며 임의 KPI를 표시하지 않는다", () => {
  const html = render(AppOverviewPage);

  assert.match(html, /주간 가시성 개요/);
  assert.match(html, /\/api\/v1\/sites/);
  assert.match(html, /\/api\/v1\/reports/);
  assert.match(html, /\/api\/v1\/integrations\/gsc\/connections/);
  assert.doesNotMatch(html, /가시성 점수|예상 트래픽|\+\d+%/);
});

test("허용 앱 화면은 승인된 v1 API 경계만 사용한다", () => {
  const sites = render(SitesPage);
  const reports = render(ReportsPage);
  const billing = render(BillingPage);
  const settings = render(SettingsPage);

  assert.match(sites, /data-endpoint="\/api\/v1\/sites"/);
  assert.match(reports, /data-endpoint="\/api\/v1\/reports"/);
  assert.match(billing, /data-endpoint="\/api\/v1\/billing\/subscription"/);
  assert.match(settings, /data-endpoint="\/api\/v1\/reports\/branding"/);
  assert.match(settings, /data-endpoint="\/api\/v1\/integrations\/gsc\/connect"/);
  assert.doesNotMatch(`${sites}${reports}${billing}${settings}`, /\/api\/(?!v1)/);
  assert.doesNotMatch(settings, /\/api\/v1\/settings/);
});
