"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";

export interface LocalizedLabel {
  ko: string;
  en: string;
}

export interface SeoLiveMetric {
  label: LocalizedLabel;
  value: number | string | null;
  suffix?: string;
}

export interface SeoLiveColumn {
  key: string;
  label: LocalizedLabel;
  align?: "left" | "right";
}

export interface SeoLiveAnalysisData {
  title: LocalizedLabel;
  description: LocalizedLabel;
  domain: string;
  projectId: string;
  countryCode: string;
  device: "desktop" | "mobile";
  sourceUpdatedAt: string | null;
  sourceRecords: number;
  metrics: SeoLiveMetric[];
  columns: SeoLiveColumn[];
  rows: Array<Record<string, string | number | null>>;
  empty: LocalizedLabel;
  form?:
    | { kind: "keyword"; action: string; value: string }
    | {
        kind: "competitor";
        action: string;
        value: string;
        options: string[];
      };
}

function displayValue(value: string | number | null, locale: "ko" | "en", suffix?: string) {
  if (value === null || value === "") return locale === "ko" ? "미제공" : "Unavailable";
  if (typeof value === "number") {
    return `${new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
      maximumFractionDigits: 2,
    }).format(value)}${suffix ?? ""}`;
  }
  return `${value}${suffix ?? ""}`;
}

function TableCell({ value, locale }: { value: string | number | null; locale: "ko" | "en" }) {
  if (value === null || value === "") {
    return <span className="text-app-text-secondary">{locale === "ko" ? "미제공" : "Unavailable"}</span>;
  }
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="block max-w-[420px] truncate text-app-blue hover:underline">
        {value}
      </a>
    );
  }
  return <>{typeof value === "number" ? new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { maximumFractionDigits: 2 }).format(value) : value}</>;
}

export function SeoLiveAnalysisDashboard({ data }: { data: SeoLiveAnalysisData }) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const lang = ko ? "ko" : "en";
  const updated = data.sourceUpdatedAt
    ? new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(data.sourceUpdatedAt))
    : null;

  return (
    <div className="p-6 text-app-text">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[12px] text-app-text-secondary">
            <span className="rounded-full bg-[#e9f7ef] px-2 py-0.5 font-medium text-[#08783e]">
              {ko ? "실제 수집 데이터" : "Live collected data"}
            </span>
            <span>{data.countryCode} · {data.device === "desktop" ? (ko ? "데스크톱" : "Desktop") : (ko ? "모바일" : "Mobile")}</span>
          </div>
          <h1 className="text-[22px] font-semibold leading-[30px]">{data.title[lang]}</h1>
          <p className="mt-1 max-w-[760px] text-[13px] leading-5 text-app-text-secondary">
            {data.description[lang]}
          </p>
        </div>
        <Link
          href={`/analytics/overview/?project=${encodeURIComponent(data.projectId)}`}
          className="inline-flex h-9 items-center rounded-[6px] border border-app-border bg-white px-4 text-[13px] font-medium hover:bg-app-bg"
        >
          {ko ? "도메인 개요" : "Domain Overview"}
        </Link>
      </div>

      <section className="mt-5 rounded-[8px] border border-app-border bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-app-text-secondary">
              {ko ? "프로젝트 도메인" : "Project domain"}
            </span>
            <strong className="mt-1 block text-[15px]">{data.domain}</strong>
          </div>
          {data.form?.kind === "keyword" && (
            <form action={data.form.action} className="flex flex-1 items-end gap-2">
              <input type="hidden" name="project" value={data.projectId} />
              <label className="min-w-[220px] flex-1 text-[12px] font-medium">
                {ko ? "키워드" : "Keyword"}
                <input
                  name="q"
                  defaultValue={data.form.value}
                  required
                  placeholder={ko ? "수집된 키워드 검색" : "Search collected keywords"}
                  className="mt-1 h-9 w-full rounded-[6px] border border-app-border px-3 outline-none focus:border-app-blue"
                />
              </label>
              <button className="h-9 rounded-[6px] bg-[#1a1e1a] px-4 text-[13px] font-medium text-white">
                {ko ? "검색" : "Search"}
              </button>
            </form>
          )}
          {data.form?.kind === "competitor" && (
            <form action={data.form.action} className="flex flex-1 items-end gap-2">
              <input type="hidden" name="project" value={data.projectId} />
              <label className="min-w-[240px] flex-1 text-[12px] font-medium">
                {ko ? "비교 도메인" : "Competitor domain"}
                <select
                  name="competitor"
                  defaultValue={data.form.value}
                  className="mt-1 h-9 w-full rounded-[6px] border border-app-border px-3 outline-none focus:border-app-blue"
                >
                  {data.form.options.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
                </select>
              </label>
              <button className="h-9 rounded-[6px] bg-[#1a1e1a] px-4 text-[13px] font-medium text-white">
                {ko ? "비교" : "Compare"}
              </button>
            </form>
          )}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {data.metrics.map((metric) => (
          <section key={metric.label.en} className="rounded-[8px] border border-app-border bg-white p-4">
            <p className="text-[12px] text-app-text-secondary">{metric.label[lang]}</p>
            <p className="mt-1 text-[22px] font-semibold">{displayValue(metric.value, lang, metric.suffix)}</p>
          </section>
        ))}
      </div>

      <section className="mt-5 overflow-hidden rounded-[8px] border border-app-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-4 py-3">
          <h2 className="text-[14px] font-semibold">{ko ? "분석 결과" : "Analysis results"}</h2>
          <span className="text-[11px] text-app-text-secondary">
            {updated
              ? `${ko ? "원천 갱신" : "Source updated"}: ${updated} · ${data.sourceRecords.toLocaleString()} ${ko ? "건" : "records"}`
              : ko
                ? "연결된 원천 데이터 없음"
                : "No connected source records"}
          </span>
        </div>
        {data.rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[15px] font-semibold">{data.empty[lang]}</p>
            <p className="mx-auto mt-2 max-w-[620px] text-[13px] leading-5 text-app-text-secondary">
              {ko
                ? "값을 만들거나 추정하지 않았습니다. 연결된 원천에서 관찰된 데이터가 생기면 이 표에 표시됩니다."
                : "No values were invented or estimated. Observed records will appear here when a connected source provides them."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[12px]">
              <thead className="bg-app-bg text-app-text-secondary">
                <tr>
                  {data.columns.map((column) => (
                    <th key={column.key} className={`px-4 py-2.5 font-medium ${column.align === "right" ? "text-right" : "text-left"}`}>
                      {column.label[lang]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={`${String(row[data.columns[0]?.key] ?? "row")}-${index}`} className="border-t border-app-border">
                    {data.columns.map((column) => (
                      <td key={column.key} className={`px-4 py-3 ${column.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                        <TableCell value={row[column.key] ?? null} locale={lang} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
