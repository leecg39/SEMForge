"use client";

import { useMemo } from "react";
import { MetricUnavailable } from "@/components/app/app-primitives";
import { KdGauge, kdLevel } from "@/components/analytics/keyword-overview/KdGauge";
import { CalcPill, Card, LivePill } from "@/components/analytics/keyword-overview/primitives";
import type { KeywordOverviewReport } from "@/components/analytics/keyword-overview/types";
import { useLocale } from "@/i18n/LocaleProvider";

const COPY = {
  en: {
    volume: "Volume",
    volumeUnavailable:
      "TalorData does not provide absolute search volume — no fake numbers here.",
    volumeAlternative: "Use the Google Trends chart below for relative interest instead.",
    difficulty: "Keyword Difficulty",
    kdInsufficient: (withProfile: number, total: number, threshold: number) =>
      `Not enough evidence: only ${withProfile} of ${total} top-10 domains have a link profile (needs ${threshold}+). Run a site audit crawl to build link graph data.`,
    kdEvidence: (withProfile: number, total: number) =>
      `Based on ${withProfile}/${total} top-10 link profiles`,
    intent: "Intent",
    intentEvidenceTitle: "Evidence",
    intentNoEvidence: "Default — no pattern or SERP feature matched.",
    patternRule: "pattern",
    featureRule: "SERP feature",
    intentLabels: {
      informational: "Informational",
      navigational: "Navigational",
      commercial: "Commercial",
      transactional: "Transactional",
    } as Record<string, string>,
    cpc: "CPC",
    cpcUnavailable: "Provided after an ads cost source is connected.",
    resultsCount: "Organic results",
    resultsNote: "Collected this run",
    rankTitle: "Your rank",
    rankFound: (position: number) => `Ranked #${position}`,
    rankMissing: "Not in collected results",
    liveTag: "Live",
  },
  ko: {
    volume: "검색량",
    volumeUnavailable: "TalorData 는 절대 검색량을 제공하지 않습니다 — 가짜 숫자로 채우지 않습니다.",
    volumeAlternative: "대신 아래 Google Trends 차트에서 상대 관심도 추세를 확인하세요.",
    difficulty: "키워드 난이도",
    kdInsufficient: (withProfile: number, total: number, threshold: number) =>
      `근거 부족: top10 중 링크 프로필이 확인된 도메인이 ${total}개 중 ${withProfile}개뿐입니다 (${threshold}개 이상 필요). 사이트 감사 크롤로 링크 그래프를 쌓으면 제공됩니다.`,
    kdEvidence: (withProfile: number, total: number) =>
      `top10 링크 프로필 ${withProfile}/${total}개 기반`,
    intent: "검색 의도",
    intentEvidenceTitle: "판정 근거",
    intentNoEvidence: "기본값 — 매칭된 패턴/SERP 피처가 없습니다.",
    patternRule: "패턴",
    featureRule: "SERP 피처",
    intentLabels: {
      informational: "정보성",
      navigational: "이동성",
      commercial: "상업성",
      transactional: "거래성",
    } as Record<string, string>,
    cpc: "CPC",
    cpcUnavailable: "광고 비용 소스를 연결하면 제공됩니다.",
    resultsCount: "오가닉 결과",
    resultsNote: "이번 수집 기준",
    rankTitle: "내 순위",
    rankFound: (position: number) => `#${position} 위 확인`,
    rankMissing: "수집된 결과에 없음",
    liveTag: "실시간",
  },
} as const;

const INTENT_STYLES: Record<string, { bg: string; text: string }> = {
  informational: { bg: "#eaf3ff", text: "#0872bf" },
  navigational: { bg: "#f3ecff", text: "#6d28d9" },
  commercial: { bg: "#fef3c7", text: "#b45309" },
  transactional: { bg: "#e6f5f0", text: "#0a6b57" },
};

/** KD 게이팅 임계값 — 서버(KD_MIN_PROFILE_DOMAINS)와 동일해야 한다. */
const KD_MIN_PROFILE_DOMAINS = 5;

export function KpiRow({
  report,
  targetDomain,
}: {
  report: KeywordOverviewReport;
  targetDomain: string;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US"),
    [locale],
  );

  const intent = report.intent ?? "informational";
  const intentStyle = INTENT_STYLES[intent] ?? INTENT_STYLES.informational;
  const kd = report.kd;
  const level = kd.score !== null ? kdLevel(kd.score) : null;

  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {/* 검색량 — 정직한 미제공 + 대체 안내 */}
      <div className="rounded-[8px] border border-dashed border-app-border bg-app-bg p-4">
        <div className="text-[12px] leading-[16px] text-app-text-secondary">{copy.volume}</div>
        <div className="mt-1 text-[24px] font-semibold leading-[32px] text-app-text-secondary/60">
          —
        </div>
        <p className="mt-1 text-[12px] leading-[16px] text-app-text-secondary">
          {copy.volumeUnavailable}
        </p>
        <p className="mt-0.5 text-[11px] leading-[15px] text-app-text-secondary/80">
          {copy.volumeAlternative}
        </p>
      </div>

      {/* 키워드 난이도 — 근거 충분 시 게이지, 부족 시 정직한 미제공 */}
      {kd.score !== null && level ? (
        <Card action={<CalcPill label={kd.model} />}>
          <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.difficulty}</h3>
          <div className="mt-1">
            <KdGauge score={kd.score} label={level[locale]} />
          </div>
          <p className="mt-1 text-[11px] text-a2-text-muted">
            {copy.kdEvidence(kd.top10WithProfile, kd.top10Count)}
          </p>
        </Card>
      ) : (
        <div className="rounded-[8px] border border-dashed border-app-border bg-app-bg p-4">
          <div className="text-[12px] leading-[16px] text-app-text-secondary">
            {copy.difficulty}
          </div>
          <div className="mt-1 text-[24px] font-semibold leading-[32px] text-app-text-secondary/60">
            —
          </div>
          <p className="mt-1 text-[11px] leading-[15px] text-app-text-secondary">
            {copy.kdInsufficient(kd.top10WithProfile, kd.top10Count, KD_MIN_PROFILE_DOMAINS)}
          </p>
        </div>
      )}

      {/* 검색 의도 — clone-intent-v1 분류 + 근거 */}
      <Card action={<CalcPill label={report.intentModel} />}>
        <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.intent}</h3>
        <p className="mt-1.5">
          <span
            className="inline-flex rounded-full px-2.5 py-1 text-[13px] font-semibold"
            style={{ backgroundColor: intentStyle.bg, color: intentStyle.text }}
          >
            {copy.intentLabels[intent] ?? intent}
          </span>
        </p>
        {report.intentEvidence.length > 0 ? (
          <div className="mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.35px] text-a2-text-faint">
              {copy.intentEvidenceTitle}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {report.intentEvidence.slice(0, 4).map((item) => (
                <span
                  key={`${item.rule}-${item.match}`}
                  className="rounded border border-app-border bg-white px-1.5 py-0.5 text-[10px] text-a2-text-muted"
                  title={item.rule === "keyword-pattern" ? copy.patternRule : copy.featureRule}
                >
                  {item.rule === "serp-feature" ? `⚙ ${item.match}` : `“${item.match}”`}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-[15px] text-a2-text-muted">
            {copy.intentNoEvidence}
          </p>
        )}
      </Card>

      {/* CPC — 미제공 */}
      <MetricUnavailable label={copy.cpc} note={copy.cpcUnavailable} />

      {/* 오가닉 결과 수 + 내 순위 — 실수집 */}
      <Card action={<LivePill label={copy.liveTag} />}>
        <h3 className="text-[12px] font-medium text-a2-text-muted">{copy.resultsCount}</h3>
        <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] text-a2-text">
          {formatter.format(report.results.length)}
        </p>
        <p className="mt-1 text-[11px] text-a2-text-muted">{copy.resultsNote}</p>
        {targetDomain.trim() && (
          <p className="mt-2 text-[12px]">
            <span className="text-a2-text-muted">{copy.rankTitle}: </span>
            {report.rank ? (
              <strong className="text-[#087b64]">{copy.rankFound(report.rank.position)}</strong>
            ) : (
              <span className="font-medium text-[#b0002a]">{copy.rankMissing}</span>
            )}
          </p>
        )}
      </Card>
    </div>
  );
}
