"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { COPY } from "./copy";
import { Card, NoDataBody, SectionHeading } from "./primitives";

/**
 * 광고 리서치 — 이 워크스페이스는 광고 SERP 를 수집하지 않으므로
 * SEMrush 와 동일한 카드 구성을 유지하되 전부 정직한 빈 상태로 표시한다.
 * 광고 스냅샷(isAd) 수집이 시작되면 Phase 2+ 에서 실데이터로 채운다.
 */
export function AdvertisingSection() {
  const { locale } = useLocale();
  const copy = COPY[locale];

  const cards = [
    copy.topPaidKeywords,
    copy.paidPositionDist,
    copy.topPaidCompetitors,
    copy.sampleAds,
  ];

  return (
    <section className="mt-6">
      <SectionHeading title={copy.advertising} />
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((title) => (
          <Card key={title} title={title}>
            <NoDataBody message={copy.paidNoData} label={copy.noData} />
          </Card>
        ))}
      </div>
    </section>
  );
}
