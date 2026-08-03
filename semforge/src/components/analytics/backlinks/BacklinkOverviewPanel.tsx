"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacklinkReport } from "@/server/backlinks/contracts";

function metric(value: number | null, locale: "ko" | "en"): string {
  return value === null ? "—" : new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function scoreBuckets(report: BacklinkReport) {
  const buckets = Array.from({ length: 10 }, (_, index) => ({
    label: index === 9 ? "91–100" : `${index * 10 + (index === 0 ? 0 : 1)}–${(index + 1) * 10}`,
    value: 0,
  }));
  for (const row of report.scoreProfile) {
    const index = Math.min(9, Math.max(0, Math.ceil(row.score / 10) - 1));
    buckets[index].value += row.referringDomains;
  }
  return buckets;
}

function DistributionBar({
  label,
  value,
  total,
  color,
  locale,
}: {
  label: string;
  value: number | null;
  total: number;
  color: string;
  locale: "ko" | "en";
}) {
  const percent = value === null || total <= 0 ? 0 : Math.min(100, (value / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="text-app-text-secondary">{label}</span>
        <span className="font-medium text-app-text">{metric(value, locale)}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#edf0f3]">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function BacklinkOverviewPanel({ report, locale }: { report: BacklinkReport; locale: "ko" | "en" }) {
  const ko = locale === "ko";
  const total = report.overview.backlinks ?? 0;
  const history = report.history.map((point) => ({
    month: point.month.slice(0, 7),
    backlinks: point.backlinks,
    domains: point.referringDomains,
  }));
  const typeTotal = [
    report.overview.textBacklinks,
    report.overview.imageBacklinks,
    report.overview.formBacklinks,
    report.overview.frameBacklinks,
  ].reduce<number>((sum, value) => sum + (value ?? 0), 0);

  return (
    <div className="space-y-4">
      <section className="rounded-[10px] border border-app-border bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-app-text">{ko ? "백링크 추이" : "Backlink trend"}</h2>
            <p className="mt-0.5 text-[12px] text-app-text-secondary">{ko ? "최근 12개월의 백링크와 추천 도메인" : "Backlinks and referring domains over the last 12 months"}</p>
          </div>
          <span className="rounded-full bg-[#eef6ff] px-2.5 py-1 text-[11px] font-medium text-[#235fe2]">Semrush v4</span>
        </div>
        {history.length > 0 ? (
          <div className="mt-4 h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eef0f2" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "#e0e1e9" }} tick={{ fontSize: 11, fill: "#6c6e79" }} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: "#6c6e79" }} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} width={46} tick={{ fontSize: 11, fill: "#6c6e79" }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="backlinks" name={ko ? "백링크" : "Backlinks"} stroke="#235fe2" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="domains" name={ko ? "추천 도메인" : "Referring domains"} stroke="#8649e1" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-4 flex h-[220px] items-center justify-center rounded-[8px] bg-app-bg text-[13px] text-app-text-secondary">
            {ko ? "제공된 월별 추이 데이터가 없습니다." : "No monthly history was returned."}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-[10px] border border-app-border bg-white p-4">
          <h2 className="text-[14px] font-semibold text-app-text">{ko ? "링크 속성" : "Link attributes"}</h2>
          <div className="mt-4 space-y-4">
            <DistributionBar label="Follow" value={report.overview.followBacklinks} total={total} color="#235fe2" locale={locale} />
            <DistributionBar label="Nofollow" value={report.overview.nofollowBacklinks} total={total} color="#8649e1" locale={locale} />
            <DistributionBar label="Sponsored" value={report.overview.sponsoredBacklinks} total={total} color="#f5a623" locale={locale} />
            <DistributionBar label="UGC" value={report.overview.ugcBacklinks} total={total} color="#16a085" locale={locale} />
          </div>
        </section>

        <section className="rounded-[10px] border border-app-border bg-white p-4">
          <h2 className="text-[14px] font-semibold text-app-text">{ko ? "백링크 유형" : "Backlink types"}</h2>
          <div className="mt-4 space-y-4">
            <DistributionBar label={ko ? "텍스트" : "Text"} value={report.overview.textBacklinks} total={typeTotal} color="#235fe2" locale={locale} />
            <DistributionBar label={ko ? "이미지" : "Image"} value={report.overview.imageBacklinks} total={typeTotal} color="#e255a1" locale={locale} />
            <DistributionBar label={ko ? "폼" : "Form"} value={report.overview.formBacklinks} total={typeTotal} color="#f5a623" locale={locale} />
            <DistributionBar label={ko ? "프레임" : "Frame"} value={report.overview.frameBacklinks} total={typeTotal} color="#16a085" locale={locale} />
          </div>
        </section>

        <section className="rounded-[10px] border border-app-border bg-white p-4">
          <h2 className="text-[14px] font-semibold text-app-text">{ko ? "Authority Score 분포" : "Authority Score distribution"}</h2>
          {report.scoreProfile.length > 0 ? (
            <div className="mt-3 h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreBuckets(report)} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#eef0f2" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e0e1e9" }} tick={{ fontSize: 9, fill: "#6c6e79" }} interval={1} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#6c6e79" }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", fontSize: 12 }} />
                  <Bar dataKey="value" name={ko ? "추천 도메인" : "Referring domains"} fill="#235fe2" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-4 flex h-[210px] items-center justify-center rounded-[8px] bg-app-bg text-[12px] text-app-text-secondary">{ko ? "점수 분포 데이터가 없습니다." : "No score profile was returned."}</div>
          )}
        </section>
      </div>
    </div>
  );
}

