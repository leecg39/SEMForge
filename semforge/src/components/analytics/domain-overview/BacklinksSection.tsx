"use client";

import { useMemo } from "react";
import { MetricUnavailable } from "@/components/app/app-primitives";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { BACKLINKS_HREF, COPY } from "./copy";
import { Card, LivePill, NoDataBody, SectionHeading, ViewDetailsLink } from "./primitives";

function BigStatCard({
  label,
  value,
  liveLabel,
}: {
  label: string;
  value: string;
  liveLabel: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[12px] font-medium text-a2-text-muted">{label}</h3>
        <LivePill label={liveLabel} />
      </div>
      <p className="mt-1 text-[26px] font-semibold leading-[32px] tracking-[-0.4px] tabular-nums text-a2-text">
        {value}
      </p>
    </Card>
  );
}

/**
 * 백링크 섹션 — 사이트 진단 크롤러(site-audit-crawler)가 적재한 링크 그래프가 있을 때만
 * 실측값을 표시하고, 없으면 미제공으로 둔다. 앵커 텍스트는 저장하지 않으므로 항상 빈 상태.
 */
export function BacklinksSection({ report }: { report: DomainAnalyticsReport }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US"),
    [locale],
  );

  const hasLinks = report.metrics.backlinks > 0;
  const followShare = report.metrics.followShare;
  const authorityRows = report.refDomainsByAuthority.filter((row) => row.referringDomains > 0);
  const maxAuthority = Math.max(...authorityRows.map((row) => row.referringDomains), 1);

  return (
    <section className="mt-6">
      <SectionHeading
        title={copy.backlinks}
        action={<ViewDetailsLink href={BACKLINKS_HREF} label={copy.viewDetails} />}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {hasLinks ? (
          <>
            <BigStatCard
              label={copy.backlinks}
              value={formatter.format(report.metrics.backlinks)}
              liveLabel={copy.liveTag}
            />
            <BigStatCard
              label={copy.referringDomainsStat}
              value={formatter.format(report.metrics.referringDomains)}
              liveLabel={copy.liveTag}
            />
          </>
        ) : (
          <>
            <MetricUnavailable label={copy.backlinks} note={copy.unavailableLinks} />
            <MetricUnavailable label={copy.referringDomainsStat} note={copy.unavailableLinks} />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {hasLinks ? (
          <Card title={copy.followVsNofollow} action={<LivePill label={copy.liveTag} />}>
            <ul className="space-y-3">
              {[
                { label: copy.followLinks, share: followShare, color: "#6a6cf6" },
                { label: copy.nofollowLinks, share: Math.max(0, 100 - followShare), color: "#c9b8f4" },
              ].map((row) => (
                <li key={row.label} className="text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-a2-text">{row.label}</span>
                    <span className="font-semibold tabular-nums text-a2-text">{row.share.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#eceef3]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.max(row.share, 1))}%`, background: row.color }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <MetricUnavailable label={copy.followVsNofollow} note={copy.unavailableLinks} className="h-full" />
        )}

        {authorityRows.length > 0 ? (
          <Card title={copy.refByAuthority} action={<LivePill label={copy.liveTag} />}>
            <ul className="space-y-2">
              {authorityRows.map((row) => (
                <li
                  key={row.bucket}
                  className="grid grid-cols-[56px_minmax(0,1fr)_48px] items-center gap-2 text-[12px]"
                >
                  <span className="tabular-nums text-a2-text">{row.bucket}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-[#eceef3]">
                    <div
                      className="h-full rounded-full bg-app-blue"
                      style={{ width: `${Math.max((row.referringDomains / maxAuthority) * 100, 2)}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums text-a2-text-muted">
                    {formatter.format(row.referringDomains)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <MetricUnavailable label={copy.refByAuthority} note={copy.unavailableLinks} className="h-full" />
        )}

        <Card title={copy.topAnchors}>
          <NoDataBody message={copy.anchorsNoData} label={copy.noData} />
        </Card>
      </div>

      <div className="mt-4">
        {report.topLinkedPages.length > 0 ? (
          <Card title={copy.topPages} action={<LivePill label={copy.liveTag} />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-app-border px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted">
                      {copy.host}
                    </th>
                    <th scope="col" className="border-b border-app-border px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted">
                      {copy.backlinks}
                    </th>
                    <th scope="col" className="border-b border-app-border px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted">
                      {copy.referringDomainsShort}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.topLinkedPages.map((row) => (
                    <tr key={row.host} className="hover:bg-[#fafbfc]">
                      <td className="max-w-[320px] truncate border-b border-[#eef0f2] px-2 py-2.5 text-[12px] font-medium text-a2-text" title={row.host}>
                        {row.host}
                      </td>
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text">
                        {formatter.format(row.backlinks)}
                      </td>
                      <td className="border-b border-[#eef0f2] px-2 py-2.5 text-right text-[12px] tabular-nums text-a2-text-muted">
                        {formatter.format(row.referringDomains)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <MetricUnavailable label={copy.topPages} note={copy.unavailableLinks} />
        )}
      </div>
    </section>
  );
}
