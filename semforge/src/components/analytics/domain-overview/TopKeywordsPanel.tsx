"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { COPY } from "./copy";
import { IntentBadge } from "./primitives";

/** 상위 키워드 탭 — 수집된 전체 랭킹 키워드 테이블. */
export function TopKeywordsPanel({ report }: { report: DomainAnalyticsReport }) {
  const { locale } = useLocale();
  const copy = COPY[locale];

  return (
    <div className="overflow-x-auto rounded-[10px] border border-app-border bg-a2-card shadow-[var(--a2-card-shadow)]">
      <table className="w-full min-w-[520px] border-collapse">
        <caption className="sr-only">
          {copy.topKeywords} — {report.query.domain}
        </caption>
        <thead>
          <tr className="bg-[#f9fafb]">
            <th scope="col" className="border-b border-app-border px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted">
              {copy.keyword}
            </th>
            <th scope="col" className="border-b border-app-border px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted">
              {copy.intentHeader}
            </th>
            <th scope="col" className="border-b border-app-border px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted">
              {copy.position}
            </th>
          </tr>
        </thead>
        <tbody>
          {report.topKeywords.map((row) => (
            <tr key={row.keyword} className="hover:bg-[#fafbfc]">
              <td className="border-b border-[#eef0f2] px-4 py-3">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] font-medium text-app-blue hover:underline"
                >
                  {row.keyword}
                </a>
              </td>
              <td className="border-b border-[#eef0f2] px-4 py-3">
                <IntentBadge intent={row.intent} />
              </td>
              <td className="border-b border-[#eef0f2] px-4 py-3 text-right text-[13px] font-semibold tabular-nums text-a2-text">
                {row.position}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.topKeywords.length === 0 && (
        <p className="p-8 text-center text-[13px] text-a2-text-muted">{copy.noKeywords}</p>
      )}
      {report.topKeywords.length > 0 && (
        <p className="border-t border-[#eef0f2] px-4 py-3 text-[11px] leading-[16px] text-a2-text-muted">
          {copy.tableUnavailableNote}
        </p>
      )}
    </div>
  );
}
