"use client";

import { useCallback, useMemo } from "react";
import { MetricUnavailable } from "@/components/app/app-primitives";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { COPY, FEATURE_LABELS } from "./copy";
import { Card, DeltaChip, LivePill, MiniArea, NoDataBody } from "./primitives";

/**
 * 추이 영역 — 트래픽(소스 없음 → 미제공), 랭킹 키워드 수 추이(실수집), SERP 피처(실수집).
 * Phase 3 에서 기간 필터와 포지션 버킷 스택 차트로 확장한다.
 */
export function TrendsSection({ report }: { report: DomainAnalyticsReport }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const preciseFormatter = useMemo(
    () => new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US"),
    [locale],
  );

  const monthLabel = useCallback(
    (period: string) =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(`${period}-01T00:00:00Z`)),
    [locale],
  );

  /** 수집된 랭킹 키워드 수 추이 — 실수집 SERP 스냅샷 기반 지표. */
  const keywordsTrend = useMemo(
    () =>
      report.trend.map((point) => ({
        label: monthLabel(point.period),
        value: point.keywords,
      })),
    [report, monthLabel],
  );

  const featureLabel = useCallback(
    (feature: string) => FEATURE_LABELS[feature]?.[locale] ?? feature.replaceAll("_", " "),
    [locale],
  );

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <MetricUnavailable label={copy.traffic} note={copy.unavailableVolume} className="h-full" />

      <Card>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.organicKeywordsStat}</h3>
          <div className="flex items-center gap-1.5">
            <DeltaChip series={keywordsTrend.map((point) => point.value)} copy={copy} />
            <LivePill label={copy.liveTag} />
          </div>
        </div>
        <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
          {preciseFormatter.format(report.metrics.organicKeywords)}
        </p>
        <div className="mt-2">
          <MiniArea
            data={keywordsTrend}
            color="#8649e1"
            name={copy.keywords}
            formatValue={(value) => preciseFormatter.format(value)}
          />
        </div>
      </Card>

      <Card
        title={copy.serpFeaturesTitle}
        hint={copy.serpFeaturesBasis}
        action={<LivePill label={copy.liveTag} />}
      >
        {report.serpFeatures.length > 0 ? (
          <ul className="space-y-2">
            {report.serpFeatures.slice(0, 8).map((row) => {
              const maxShare = report.serpFeatures[0]?.share ?? 1;
              return (
                <li
                  key={row.feature}
                  className="grid grid-cols-[minmax(90px,130px)_minmax(0,1fr)_64px] items-center gap-2 text-[12px]"
                >
                  <span className="truncate capitalize text-a2-text" title={featureLabel(row.feature)}>
                    {featureLabel(row.feature)}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-[#eceef3]">
                    <div
                      className="h-full rounded-full bg-app-blue"
                      style={{ width: `${Math.max((row.share / maxShare) * 100, 2)}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums text-a2-text-muted">{row.share.toFixed(2)}%</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <NoDataBody message={copy.serpFeaturesEmpty} label={copy.noData} />
        )}
      </Card>
    </div>
  );
}
