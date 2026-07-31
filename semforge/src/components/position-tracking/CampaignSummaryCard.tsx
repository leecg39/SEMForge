"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { api } from "@/lib/client-api";
import type { KeywordHighlights } from "@/server/position-tracking/highlights";
import type { CampaignOverview } from "@/server/position-tracking/overview";

const COPY = {
  ko: {
    title: "Summary",
    badge: "실측 기반 자동 요약",
    empty: "수집 이력이 쌓이면 이 캠페인의 변화를 요약해 드립니다. 먼저 '지금 순위 수집'을 실행해 보세요.",
    hint: "규칙 기반 요약 — 수집된 실측값만 서술하며, 가시성 변화 값은 CTR 곡선(clone-traffic-v1) 계산식입니다.",
  },
  en: {
    title: "Summary",
    badge: "Auto summary from actuals",
    empty: "Run “Collect positions now” to build history; the campaign changes will be summarized here.",
    hint: "Rule-based summary — only collected actuals are described. Visibility deltas use the clone-traffic-v1 CTR model.",
  },
} as const;

interface SummaryInput {
  domain: string;
  location: string;
  searchEngine: string;
  device: string;
}

function buildSentences(
  locale: "ko" | "en",
  campaign: SummaryInput,
  overview: CampaignOverview,
  highlights: KeywordHighlights | null
): { lead: string; bullets: string[] } | null {
  const { visibility } = overview;
  if (visibility.current === null && overview.keywordCount === 0) return null;

  const target = `${campaign.location} (${campaign.searchEngine}) · ${campaign.device}`;
  const ko = locale === "ko";

  let lead: string;
  if (visibility.current === null) {
    lead = ko
      ? `${target} 를 타겟팅하는 ${campaign.domain} 캠페인은 아직 수집 이력이 없습니다.`
      : `The campaign for ${campaign.domain} targeting ${target} has no collection history yet.`;
  } else if (visibility.diff === null) {
    lead = ko
      ? `${target} 를 타겟팅하는 ${campaign.domain}의 현재 가시성은 ${visibility.current}%입니다. 비교할 직전 수집이 아직 없습니다.`
      : `${campaign.domain} targeting ${target} currently has ${visibility.current}% visibility. There is no previous collection to compare against yet.`;
  } else {
    const direction = visibility.diff > 0 ? (ko ? "상승" : "up") : visibility.diff < 0 ? (ko ? "하락" : "down") : ko ? "변화 없음" : "unchanged";
    lead = ko
      ? `${target} 를 타겟팅하는 ${campaign.domain}의 가시성이 직전 수집 대비 ${Math.abs(visibility.diff)}%p ${direction}해 현재 ${visibility.current}%입니다.`
      : `Visibility for ${campaign.domain} targeting ${target} is ${direction} ${Math.abs(visibility.diff)}pp vs. the previous collection, now at ${visibility.current}%.`;
  }

  const bullets: string[] = [];

  const movers = [...(highlights?.gainers ?? []), ...(highlights?.losers ?? [])]
    .filter((row) => row.visibilityDelta !== null && row.visibilityDelta !== 0)
    .sort((a, b) => Math.abs(b.visibilityDelta!) - Math.abs(a.visibilityDelta!))
    .slice(0, 3);
  if (movers.length > 0) {
    const parts = movers.map((row) => {
      const move =
        row.previousPosition !== null && row.position !== null
          ? row.previousPosition - row.position
          : null;
      const moveText =
        move === null
          ? row.position === null
            ? ko
              ? "순위권 이탈"
              : "dropped out"
            : ko
              ? "신규 진입"
              : "new entry"
          : `${move > 0 ? "↑" : "↓"}${Math.abs(move)}`;
      const sign = row.visibilityDelta! > 0 ? "+" : "";
      return `${row.keyword} (${sign}${row.visibilityDelta!.toFixed(2)}%p, ${moveText})`;
    });
    bullets.push(
      ko ? `가시성 변동이 있는 키워드: ${parts.join(", ")}` : `Keywords with visibility movement: ${parts.join(", ")}`
    );
  }

  if (overview.newRanked > 0 || overview.dropped > 0) {
    bullets.push(
      ko
        ? `순위권 신규 진입 ${overview.newRanked}개, 이탈 ${overview.dropped}개.`
        : `${overview.newRanked} keywords newly ranked, ${overview.dropped} dropped out.`
    );
  }

  const top10 = overview.topBuckets.find((bucket) => bucket.key === "top10");
  if (top10 && top10.count > 0) {
    const changes: string[] = [];
    if (top10.entered > 0) changes.push(ko ? `신규 ${top10.entered}개` : `${top10.entered} new`);
    if (top10.left > 0) changes.push(ko ? `이탈 ${top10.left}개` : `${top10.left} lost`);
    bullets.push(
      ko
        ? `상위 10위 키워드 ${top10.count}개${changes.length > 0 ? ` (${changes.join(", ")})` : ""}.`
        : `${top10.count} keywords in the top 10${changes.length > 0 ? ` (${changes.join(", ")})` : ""}.`
    );
  }

  if (
    overview.estimatedTraffic.current !== null &&
    overview.estimatedTraffic.diff !== null &&
    overview.estimatedTraffic.diff !== 0
  ) {
    const rising = overview.estimatedTraffic.diff > 0;
    bullets.push(
      ko
        ? `예상 트래픽이 ${Math.abs(overview.estimatedTraffic.diff)} ${rising ? "증가" : "감소"}해 ${overview.estimatedTraffic.current}입니다 (검색량 보유 키워드 ${overview.estimatedTraffic.coveredKeywords}개 기준).`
        : `Estimated traffic ${rising ? "rose" : "fell"} by ${Math.abs(overview.estimatedTraffic.diff)} to ${overview.estimatedTraffic.current} (based on ${overview.estimatedTraffic.coveredKeywords} keywords with volume).`
    );
  }

  return { lead, bullets };
}

/**
 * 원본의 Summary 카드 — LLM 이 아니라 규칙 기반으로, 수집된 실측값만 문장으로
 * 조립한다. 근거 없는 서술은 만들지 않는다.
 */
export function CampaignSummaryCard({
  campaignId,
  campaign,
  refreshKey,
}: {
  campaignId: string;
  campaign: SummaryInput;
  refreshKey: number;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [result, setResult] = useState<{
    key: string;
    overview: CampaignOverview | null;
    highlights: KeywordHighlights | null;
  } | null>(null);
  const requestKey = `${campaignId}:${refreshKey}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [overview, highlights] = await Promise.all([
          api.get<CampaignOverview>(
            `/api/position-tracking/${encodeURIComponent(campaignId)}/overview/`
          ),
          api
            .get<KeywordHighlights>(
              `/api/position-tracking/${encodeURIComponent(campaignId)}/highlights/`
            )
            .catch(() => null),
        ]);
        if (!cancelled) {
          setResult({
            key: requestKey,
            overview: overview.data,
            highlights: highlights?.data ?? null,
          });
        }
      } catch {
        if (!cancelled) setResult({ key: requestKey, overview: null, highlights: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, requestKey]);

  const overview = result?.key === requestKey ? result.overview : null;
  const highlights = result?.key === requestKey ? result.highlights : null;

  const summary = useMemo(
    () => (overview ? buildSentences(locale, campaign, overview, highlights) : null),
    [locale, campaign, overview, highlights]
  );

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">{copy.title}</h3>
        <span className="rounded-full bg-[#e6f5f0] px-2 py-0.5 text-[11px] font-semibold text-[#0a6b57]">
          {copy.badge}
        </span>
      </div>

      {!summary ? (
        <p className="mt-3 text-[13px] leading-[20px] text-app-text-secondary">{copy.empty}</p>
      ) : (
        <>
          <p className="mt-3 text-[13px] leading-[21px] text-app-text">{summary.lead}</p>
          {summary.bullets.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-[20px] text-app-text">
              {summary.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="mt-3 border-t border-app-border pt-2 text-[11px] leading-[16px] text-app-text-secondary">
        {copy.hint}
      </p>
    </section>
  );
}
