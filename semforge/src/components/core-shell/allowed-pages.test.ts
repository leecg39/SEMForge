// @TASK P1-F1-T1 - Allowed page render contracts
// @SPEC SEMForge paid beta plan#allowed-pages
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

test("앱 개요는 수집 전 상태와 설정 순서를 정직하게 안내한다", () => {
  const html = render(AppOverviewPage);

  assert.match(html, /주간 가시성 개요/);
  assert.match(html, /첫 데이터를 준비해 주세요/);
  assert.match(html, /사이트 등록/);
  assert.match(html, /Search Console 연결/);
  assert.doesNotMatch(html, /\d+%/);
});

test("사이트와 리포트 화면은 승인된 v1 API 경계만 사용한다", () => {
  const sites = render(SitesPage);
  const reports = render(ReportsPage);

  assert.match(sites, /data-endpoint="\/api\/v1\/sites"/);
  assert.match(reports, /data-endpoint="\/api\/v1\/reports"/);
  assert.doesNotMatch(`${sites}${reports}`, /\/api\/(?!v1)/);
});
