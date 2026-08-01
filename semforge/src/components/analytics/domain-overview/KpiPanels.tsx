"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { AI_VISIBILITY_HREF, COPY } from "./copy";
import { LivePill, StatBlock } from "./primitives";

function PanelTag({ label }: { label: string }) {
  return (
    <span className="rounded-[5px] bg-[#efe7fd] px-2 py-0.5 text-[11px] font-semibold text-[#6d28d9]">
      {label}
    </span>
  );
}

const AI_CHANNELS = ["ChatGPT", "Google AI Overview", "Google AI Mode", "Gemini"] as const;

/**
 * 리포트 상단 듀얼 KPI 패널 (SEMrush 도메인 개요 상단 구성).
 * 좌: AI 검색 — Phase 2 에서 AI 가시성 실측(getAiVisibilityOverview)과 연결 예정.
 *     그 전까지는 미제공 상태를 정직하게 표시한다.
 * 우: SEO — 수집 데이터가 있는 지표(자연 키워드, 링크 그래프 기반 백링크)만 값 표시.
 */
export function KpiPanels({ report }: { report: DomainAnalyticsReport }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US"),
    [locale],
  );

  const hasLinks = report.metrics.backlinks > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.7fr)]">
      {/* AI 검색 패널 */}
      <section className="min-w-0 rounded-[10px] border border-app-border bg-a2-card p-4 shadow-[var(--a2-card-shadow)]">
        <div className="flex items-center justify-between gap-2">
          <PanelTag label={copy.aiSearchTag} />
          <Link
            href={AI_VISIBILITY_HREF}
            className="text-[11px] font-semibold text-app-blue hover:text-app-blue-dark hover:underline"
          >
            {copy.openAiVisibility} →
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <StatBlock label={copy.aiVisibilityStat} value={null} note={copy.aiPanelHint} />
          <StatBlock label={copy.mentionsStat} value={null} note={copy.aiPanelHint} />
          <StatBlock label={copy.citedPagesStat} value={null} note={copy.aiPanelHint} />
        </div>
        <ul className="mt-3 space-y-1.5 border-t border-app-border pt-3">
          {AI_CHANNELS.map((channel) => (
            <li key={channel} className="flex items-center justify-between text-[12px]">
              <span className="text-a2-text-muted">{channel}</span>
              <span className="tabular-nums text-a2-text-faint">—</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-[16px] text-a2-text-muted">{copy.aiPanelEmpty}</p>
      </section>

      {/* SEO 패널 */}
      <section className="min-w-0 rounded-[10px] border border-app-border bg-a2-card p-4 shadow-[var(--a2-card-shadow)]">
        <PanelTag label={copy.seoTag} />
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
          <StatBlock label={copy.authority} value={null} note={copy.unavailableAuthority} />
          <StatBlock label={copy.organicTrafficStat} value={null} note={copy.unavailableVolume} />
          <StatBlock label={copy.paidTrafficStat} value={null} note={copy.unavailablePaid} />
          <StatBlock
            label={copy.referringDomainsStat}
            value={hasLinks ? formatter.format(report.metrics.referringDomains) : null}
            note={hasLinks ? undefined : copy.unavailableLinks}
            badge={hasLinks ? <LivePill label={copy.liveTag} /> : undefined}
          />
          <StatBlock label={copy.trafficShareStat} value={null} note={copy.unavailableShare} />
          <StatBlock
            label={copy.organicKeywordsStat}
            value={formatter.format(report.metrics.organicKeywords)}
            badge={<LivePill label={copy.liveTag} />}
          />
          <StatBlock label={copy.paidKeywordsStat} value={null} note={copy.unavailablePaid} />
          <StatBlock
            label={copy.backlinks}
            value={hasLinks ? formatter.format(report.metrics.backlinks) : null}
            note={hasLinks ? undefined : copy.unavailableLinks}
            badge={hasLinks ? <LivePill label={copy.liveTag} /> : undefined}
          />
        </div>
      </section>
    </div>
  );
}
