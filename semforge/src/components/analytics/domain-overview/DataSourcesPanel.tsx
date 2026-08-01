"use client";

import { useMemo } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { COPY } from "./copy";

/** 데이터 원천 탭 — 원천 스토어 파이프라인과 개인정보 경계 안내. */
export function DataSourcesPanel({ report }: { report: DomainAnalyticsReport }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const preciseFormatter = useMemo(
    () => new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US"),
    [locale],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [locale],
  );

  return (
    <>
      <div className="rounded-[10px] border border-app-border bg-a2-card p-4 shadow-[var(--a2-card-shadow)] sm:p-5">
        <h2 className="text-[16px] font-semibold text-a2-text">{copy.pipelineTitle}</h2>
        <p className="mt-1 text-[12px] leading-[18px] text-a2-text-muted">{copy.pipelineDescription}</p>
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.45px] text-a2-text-muted">
            {copy.sourceStores}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.sources.map((source, index) => (
              <article key={source.key} className="rounded-[8px] border border-app-border bg-[#fafbfc] p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#eaf3ff] text-[11px] font-bold text-app-blue">
                    {index + 1}
                  </span>
                  <span className="text-[10px] text-a2-text-muted">{source.cadence}</span>
                </div>
                <h3 className="mt-3 text-[13px] font-semibold text-a2-text">{source.label}</h3>
                <p className="mt-1 text-[11px] leading-[17px] text-a2-text-muted">{source.role}</p>
                <p className="mt-2 text-[11px] font-medium text-a2-text">
                  {preciseFormatter.format(source.records)} {copy.records}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-[10px] border border-app-border bg-a2-card shadow-[var(--a2-card-shadow)]">
        <table className="w-full min-w-[760px] border-collapse">
          <caption className="sr-only">{copy.dataSources}</caption>
          <thead>
            <tr className="bg-[#f9fafb]">
              {[copy.dataSources, copy.cadence, copy.role, copy.freshness].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="border-b border-app-border px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.sources.map((source) => (
              <tr key={source.key}>
                <th scope="row" className="border-b border-[#eef0f2] px-4 py-3 text-left text-[13px] font-semibold text-a2-text">
                  {source.label}
                  <span className="ml-2 font-normal text-a2-text-muted">
                    ({preciseFormatter.format(source.records)})
                  </span>
                </th>
                <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-a2-text-muted">{source.cadence}</td>
                <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-a2-text-muted">{source.role}</td>
                <td className="border-b border-[#eef0f2] px-4 py-3 text-[12px] text-a2-text-muted">
                  {source.lastUpdated ? dateFormatter.format(new Date(source.lastUpdated)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <article className="mt-4 rounded-[10px] border border-[#bce8dc] bg-[#f1fbf8] p-4">
        <h2 className="text-[14px] font-semibold text-[#087b64]">{copy.privacy}</h2>
        <p className="mt-2 text-[12px] leading-[18px] text-[#3c6860]">{copy.privacyBody}</p>
        <code className="mt-4 block overflow-x-auto rounded-[6px] bg-white px-3 py-2 text-[11px] text-a2-text">
          rawIdentifiersExposed: false
        </code>
      </article>
    </>
  );
}
