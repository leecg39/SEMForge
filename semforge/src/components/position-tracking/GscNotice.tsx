"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import type { GscKeywordMetricsState } from "@/components/position-tracking/use-gsc-keyword-metrics";

const COPY = {
  ko: {
    connectTitle: "Google Search Console 연결",
    connectBody:
      "연결하면 추적 키워드의 실제 클릭·노출·CTR·평균 게재순위(최근 28일, GSC 실측)를 표에 함께 표시합니다. TalorData 수집 순위와는 별개 출처입니다.",
    connectCta: "Google 계정으로 연결",
    mismatchTitle: "GSC 속성이 캠페인 도메인과 다릅니다",
    mismatchBody: (siteUrl: string, domain: string) =>
      `연결된 Search Console 속성(${siteUrl})이 이 캠페인 도메인(${domain})을 커버하지 않아 실측 지표를 표시할 수 없습니다. 해당 도메인의 GSC 속성이 있는 Google 계정으로 다시 연결해 주세요.`,
    unavailableTitle: "GSC 데이터를 불러오지 못했습니다",
    checking: "GSC 연결 상태 확인 중…",
  },
  en: {
    connectTitle: "Connect Google Search Console",
    connectBody:
      "Connect to show real clicks, impressions, CTR, and average position (last 28 days, measured by GSC) next to your tracked keywords. This is a separate source from TalorData collection.",
    connectCta: "Connect with Google",
    mismatchTitle: "GSC property does not match the campaign domain",
    mismatchBody: (siteUrl: string, domain: string) =>
      `The connected Search Console property (${siteUrl}) does not cover this campaign domain (${domain}). Reconnect with a Google account that has a GSC property for the domain.`,
    unavailableTitle: "GSC data could not be loaded",
    checking: "Checking GSC connection…",
  },
} as const;

/**
 * GSC 상태별 안내 카드.
 * 연결됨(ready) 상태에서는 아무것도 그리지 않는다 (컬럼 헤더에 출처를 표기).
 */
export function GscNotice({
  state,
  loading,
  campaignDomain,
}: {
  state: GscKeywordMetricsState | null;
  loading: boolean;
  campaignDomain: string;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];

  if (loading) {
    return (
      <div className="rounded-[8px] border border-app-border bg-white px-4 py-3 text-[13px] text-app-text-secondary">
        {copy.checking}
      </div>
    );
  }
  if (!state || state.kind === "ready") return null;

  if (state.kind === "disconnected") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-app-border bg-white p-4">
        <div className="max-w-[640px]">
          <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">
            {copy.connectTitle}
          </h3>
          <p className="mt-1 text-[13px] leading-[20px] text-app-text-secondary">
            {copy.connectBody}
          </p>
        </div>
        {/* OAuth 시작 엔드포인트(302)라 클라이언트 라우팅이 아닌 전체 페이지 이동이 필요하다. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/gsc/auth/start/"
          className="inline-flex h-[36px] shrink-0 items-center rounded-[8px] bg-app-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-app-blue-dark"
        >
          {copy.connectCta}
        </a>
      </div>
    );
  }

  if (state.kind === "domain-mismatch") {
    return (
      <div className="rounded-[8px] border border-[#f5e2b8] bg-[#fdf7e7] px-4 py-3">
        <h3 className="text-[13px] font-semibold leading-[18px] text-[#7c5a10]">
          {copy.mismatchTitle}
        </h3>
        <p className="mt-0.5 text-[13px] leading-[20px] text-[#7c5a10]">
          {copy.mismatchBody(state.siteUrl, campaignDomain)}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-app-border bg-white px-4 py-3">
      <h3 className="text-[13px] font-semibold leading-[18px] text-app-text">
        {copy.unavailableTitle}
      </h3>
      <p className="mt-0.5 text-[13px] leading-[20px] text-app-text-secondary">{state.reason}</p>
    </div>
  );
}
