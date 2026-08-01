"use client";

import { useMemo } from "react";
import { MetricUnavailable } from "@/components/app/app-primitives";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";
import { COPY, INTENT_META, ORGANIC_RESEARCH_HREF } from "./copy";
import {
  CalcPill,
  Card,
  IntentBadge,
  LivePill,
  NoDataBody,
  SectionHeading,
  ViewDetailsLink,
} from "./primitives";

const HeaderCell = ({ children, align = "left" }: { children: string; align?: "left" | "right" }) => (
  <th
    scope="col"
    className={cn(
      "border-b border-app-border px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted",
      align === "right" ? "text-right" : "text-left",
    )}
  >
    {children}
  </th>
);

/**
 * 자연검색 리서치 — 상위 자연 키워드, 의도별 키워드(계산식), 자연 포지션 분포.
 * 경쟁자 집계(주요 자연 경쟁자·포지셔닝 지도)는 Phase 2 서버 확장에서 채운다.
 */
export function OrganicResearchSection({ report }: { report: DomainAnalyticsReport }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US"),
    [locale],
  );

  const intentRows = useMemo(
    () => [...report.intentDistribution].sort((a, b) => b.share - a.share),
    [report],
  );
  const maxBucket = Math.max(...report.positionDistribution.map((row) => row.keywords), 1);

  return (
    <section className="mt-6">
      <SectionHeading
        title={copy.organicResearch}
        action={<ViewDetailsLink href={ORGANIC_RESEARCH_HREF} label={copy.viewDetails} />}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {/* 상위 자연 키워드 */}
        <Card
          title={`${copy.topOrganicKeywords} ${report.topKeywords.length}`}
          action={<LivePill label={copy.liveTag} />}
        >
          {report.topKeywords.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] border-collapse">
                  <thead>
                    <tr>
                      <HeaderCell>{copy.keyword}</HeaderCell>
                      <HeaderCell>{copy.intentHeader}</HeaderCell>
                      <HeaderCell align="right">{copy.position}</HeaderCell>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topKeywords.slice(0, 10).map((row) => (
                      <tr key={row.keyword} className="hover:bg-[#fafbfc]">
                        <td
                          className="max-w-[240px] truncate border-b border-[#eef0f2] px-2 py-2.5 text-[12px] font-medium text-a2-text"
                          title={row.keyword}
                        >
                          {row.keyword}
                        </td>
                        <td className="border-b border-[#eef0f2] px-2 py-2.5">
                          <IntentBadge intent={row.intent} />
                        </td>
                        <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] font-semibold tabular-nums text-a2-text">
                          {row.position}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] leading-[16px] text-a2-text-muted">{copy.tableUnavailableNote}</p>
            </>
          ) : (
            <NoDataBody message={copy.noKeywords} label={copy.noData} />
          )}
        </Card>

        {/* 의도별 키워드 — clone-intent-v1 계산식 */}
        <Card
          title={copy.keywordsByIntent}
          hint={copy.intentModelNote}
          action={<CalcPill label={copy.calcTag} model="clone-intent-v1" />}
        >
          {intentRows.length > 0 ? (
            <>
              <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-[#eceef3]">
                {intentRows.map((row) =>
                  row.share > 0 ? (
                    <div
                      key={row.intent}
                      className="h-full"
                      style={{ width: `${row.share}%`, background: INTENT_META[row.intent].color }}
                      title={`${INTENT_META[row.intent].label[locale]}: ${row.share.toFixed(1)}%`}
                    />
                  ) : null,
                )}
              </div>
              <table className="mt-3 w-full border-collapse">
                <thead>
                  <tr>
                    <HeaderCell>{copy.intentHeader}</HeaderCell>
                    <HeaderCell align="right">{copy.shareHeader}</HeaderCell>
                    <HeaderCell align="right">{copy.keywordsHeader}</HeaderCell>
                  </tr>
                </thead>
                <tbody>
                  {intentRows.map((row) => (
                    <tr key={row.intent}>
                      <td className="border-b border-[#eef0f2] px-2 py-2">
                        <span className="flex items-center gap-2 text-[12px] text-a2-text">
                          <IntentBadge intent={row.intent} />
                          {INTENT_META[row.intent].label[locale]}
                        </span>
                      </td>
                      <td className="border-b border-[#eef0f2] px-2 py-2 text-right text-[12px] font-semibold tabular-nums text-app-blue">
                        {row.share.toFixed(1)}%
                      </td>
                      <td className="border-b border-[#eef0f2] px-2 py-2 text-right text-[12px] tabular-nums text-a2-text">
                        {formatter.format(row.keywords)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <NoDataBody message={copy.noKeywords} label={copy.noData} />
          )}
        </Card>

        {/* 자연 포지션 분포 — 히스토그램 */}
        <Card
          title={copy.organicPositionDist}
          hint={copy.currentSnapshot}
          action={<LivePill label={copy.liveTag} />}
        >
          <div className="flex h-[150px] items-end gap-2 px-1" role="img" aria-label={copy.organicPositionDist}>
            {report.positionDistribution.map((row) => (
              <div key={row.bucket} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] tabular-nums text-a2-text-muted">
                  {row.keywords > 0 ? formatter.format(row.keywords) : ""}
                </span>
                <div
                  className="w-full max-w-[56px] rounded-t-[4px] bg-[#6a6cf6]"
                  style={{ height: `${row.keywords > 0 ? Math.max((row.keywords / maxBucket) * 100, 4) : 0}%` }}
                  title={`${row.bucket}: ${formatter.format(row.keywords)}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2 border-t border-[#eef0f2] px-1 pt-1.5">
            {report.positionDistribution.map((row) => (
              <span key={row.bucket} className="flex-1 text-center text-[10px] tabular-nums text-a2-text-muted">
                {row.bucket}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[10px] text-a2-text-faint">{copy.serpPositionAxis}</p>
        </Card>

        {/* 경쟁자 집계 — Phase 2 (SERP 교차 집계) */}
        <div className="grid gap-4">
          <MetricUnavailable
            label={copy.topCompetitors}
            note={copy.unavailableCompetitors}
            className="h-full"
          />
          <MetricUnavailable
            label={copy.positioningMap}
            note={copy.unavailableCompetitors}
            className="h-full"
          />
        </div>
      </div>
    </section>
  );
}
