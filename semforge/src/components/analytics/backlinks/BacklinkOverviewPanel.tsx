"use client";

import { BarChartIcon, ClockIcon, Link2Icon } from "@radix-ui/react-icons";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BacklinkReport } from "@/server/backlinks/contracts";

function number(value: number, locale: "ko" | "en"): string {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US").format(value);
}

export function BacklinkOverviewPanel({ report, locale, onSelectPage }: {
  report: BacklinkReport;
  locale: "ko" | "en";
  onSelectPage: (url: string) => void;
}) {
  const ko = locale === "ko";
  const hasHistory = report.history.length >= 2;
  return (
    <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
      <section className="rounded-[10px] border border-app-border bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-[14px] font-semibold text-app-text">{ko ? "백링크 추이" : "Backlink trend"}</h2><p className="mt-1 text-[11px] text-app-text-secondary">{ko ? "전환 이후 저장된 일별 스냅샷" : "Daily snapshots collected after connection"}</p></div>
          <ClockIcon className="h-4 w-4 text-app-text-secondary" />
        </div>
        {hasHistory ? (
          <div className="mt-5 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report.history} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#747985" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#747985" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e2e5e9", fontSize: 12 }} />
                <Line type="monotone" dataKey="totalInboundLinks" stroke="#6557e8" strokeWidth={2} dot={{ r: 3 }} name={ko ? "인바운드 링크" : "Inbound links"} />
                <Line type="monotone" dataKey="linkedPages" stroke="#34b68a" strokeWidth={2} dot={{ r: 3 }} name={ko ? "링크된 페이지" : "Linked pages"} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-5 flex h-[250px] flex-col items-center justify-center rounded-[8px] border border-dashed border-app-border bg-[#fafbfc] text-center">
            <BarChartIcon className="h-7 w-7 text-[#8b83df]" />
            <p className="mt-3 text-[13px] font-medium text-app-text">{ko ? "추이는 두 번 이상 수집 후 표시됩니다" : "Trends appear after two collections"}</p>
            <p className="mt-1 max-w-[360px] text-[11px] leading-5 text-app-text-secondary">{ko ? "과거 수치는 생성하지 않습니다. 다음 수집부터 실제 변화만 기록합니다." : "Historical values are not fabricated. Only real changes are recorded."}</p>
          </div>
        )}
      </section>

      <section className="rounded-[10px] border border-app-border bg-white p-5">
        <div className="flex items-center justify-between"><div><h2 className="text-[14px] font-semibold text-app-text">{ko ? "상위 링크된 페이지" : "Top linked pages"}</h2><p className="mt-1 text-[11px] text-app-text-secondary">{ko ? "인바운드 링크가 많은 페이지" : "Pages receiving the most links"}</p></div><Link2Icon className="h-4 w-4 text-app-text-secondary" /></div>
        <div className="mt-4 divide-y divide-[#eef0f2]">
          {report.topTargetPages.slice(0, 6).map((row) => (
            <button key={row.url} type="button" onClick={() => onSelectPage(row.url)} className="flex w-full items-center gap-4 py-3 text-left hover:bg-[#fafbfc]">
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#285fca]">{row.url}</span>
              <span className="rounded-full bg-[#f0efff] px-2 py-1 text-[11px] font-semibold text-[#6557e8]">{number(row.linkCount, locale)}</span>
            </button>
          ))}
          {report.topTargetPages.length === 0 && <div className="py-16 text-center text-[12px] text-app-text-secondary">{ko ? "표시할 링크 페이지가 없습니다." : "No linked pages available."}</div>}
        </div>
      </section>

      <section className="rounded-[10px] border border-app-border bg-white p-5 xl:col-span-2">
        <h2 className="text-[14px] font-semibold text-app-text">{ko ? "수집 범위와 데이터 출처" : "Coverage and sources"}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[8px] bg-[#f7f8fa] p-4"><p className="text-[11px] text-app-text-secondary">{ko ? "링크 데이터" : "Link data"}</p><p className="mt-1 text-[13px] font-semibold text-app-text">{report.provenance.provider === "common-crawl" ? "Common Crawl" : report.provenance.provider === "bing-csv" ? (ko ? "이전 Bing CSV" : "Legacy Bing CSV") : "Bing Webmaster API"}</p>{report.provenance.commonCrawlRelease && <p className="mt-1 text-[9px] text-app-text-secondary">{report.provenance.commonCrawlRelease}</p>}</div>
          <div className="rounded-[8px] bg-[#f7f8fa] p-4"><p className="text-[11px] text-app-text-secondary">{ko ? "분석 범위" : "Scope"}</p><p className="mt-1 truncate text-[13px] font-semibold text-app-text">{report.targetUrl ?? report.siteUrl}</p></div>
          <div className="rounded-[8px] bg-[#f7f8fa] p-4"><p className="text-[11px] text-app-text-secondary">{ko ? "데이터 완전성" : "Completeness"}</p><p className="mt-1 text-[13px] font-semibold text-app-text">{report.provenance.partial ? (ko ? "부분 수집" : "Partial") : (ko ? "수집 완료" : "Complete")}</p></div>
        </div>
      </section>
    </div>
  );
}
