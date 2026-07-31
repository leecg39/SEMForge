"use client";

import { Card, LivePill } from "@/components/analytics/keyword-overview/primitives";
import type {
  KeywordOverviewReport,
  KeywordOverviewResult,
} from "@/components/analytics/keyword-overview/types";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

const COPY = {
  en: {
    title: "Live SERP results",
    position: "Pos",
    change: "Δ",
    result: "Result",
    newEntry: "New",
    liveTag: "Live",
    tableUnavailableNote:
      "Authority, backlink and referring-domain metrics are hidden — no connected data source.",
  },
  ko: {
    title: "실시간 SERP 결과",
    position: "순위",
    change: "Δ",
    result: "결과",
    newEntry: "신규",
    liveTag: "실시간",
    tableUnavailableNote:
      "권위·백링크·참조 도메인 지표는 연결된 데이터 소스가 없어 표시하지 않습니다.",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function DeltaCell({
  row,
  hasHistory,
  copy,
}: {
  row: KeywordOverviewResult;
  hasHistory: boolean;
  copy: Copy;
}) {
  if (!hasHistory) return <span className="text-a2-text-faint">—</span>;
  if (row.previousPosition === null) {
    return (
      <span className="inline-flex rounded-full bg-[#eaf3ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#0872bf]">
        {copy.newEntry}
      </span>
    );
  }
  const delta = row.previousPosition - row.position;
  if (delta === 0) return <span className="text-a2-text-faint">＝</span>;
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        delta > 0 ? "text-[#087b64]" : "text-[#b0002a]",
      )}
      title={`#${row.previousPosition} → #${row.position}`}
    >
      {delta > 0 ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

export function SerpResultsCard({ report }: { report: KeywordOverviewReport }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const hasHistory = report.captures.length > 1;

  return (
    <Card title={copy.title} action={<LivePill label={copy.liveTag} />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr>
              {[copy.position, copy.change, copy.result].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="border-b border-app-border px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.35px] text-a2-text-muted"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.results.map((row) => {
              const isTarget = report.rank !== null && row.position === report.rank.position;
              return (
                <tr
                  key={`${row.position}-${row.link}`}
                  className={cn("hover:bg-[#fafbfc]", isTarget && "bg-[#f1fbf6]")}
                >
                  <td className="border-b border-[#eef0f2] px-2 py-2.5 text-[13px] font-semibold tabular-nums text-a2-text">
                    {row.position}
                  </td>
                  <td className="border-b border-[#eef0f2] px-2 py-2.5 text-[12px]">
                    <DeltaCell row={row} hasHistory={hasHistory} copy={copy} />
                  </td>
                  <td className="border-b border-[#eef0f2] px-2 py-2.5">
                    <a
                      href={row.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block max-w-[420px] truncate text-[13px] font-medium text-app-blue hover:underline"
                      title={row.title || row.link}
                    >
                      {row.title || row.link}
                    </a>
                    <span className="block max-w-[420px] truncate text-[11px] text-a2-text-muted">
                      {row.domain}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-[16px] text-a2-text-muted">
        {copy.tableUnavailableNote}
      </p>
    </Card>
  );
}
