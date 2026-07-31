"use client";

import { useMemo } from "react";
import { Card } from "@/components/analytics/keyword-overview/primitives";
import type { KeywordOverviewReport } from "@/components/analytics/keyword-overview/types";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

const COPY = {
  en: {
    title: "Collection history",
    hint: "Snapshots stored in serp_snapshots",
    results: "results",
  },
  ko: {
    title: "수집 이력",
    hint: "serp_snapshots 에 저장된 스냅샷",
    results: "개 결과",
  },
} as const;

export function CapturesCard({ report }: { report: KeywordOverviewReport }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );

  return (
    <Card title={copy.title} hint={copy.hint}>
      <ul className="space-y-2">
        {report.captures.map((capture) => (
          <li
            key={capture.capturedAt}
            className={cn(
              "flex items-center justify-between gap-2 rounded-[7px] border border-app-border px-3 py-2 text-[12px]",
              capture.capturedAt === report.capturedAt && "border-[#b9d8f2] bg-[#f5faff]",
            )}
          >
            <span className="text-a2-text">
              {dateTimeFormatter.format(new Date(capture.capturedAt))}
            </span>
            <span className="shrink-0 tabular-nums text-a2-text-muted">
              {capture.results}
              {locale === "ko" ? copy.results : ` ${copy.results}`}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
