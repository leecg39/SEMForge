"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AiVisibilityProvider } from "@/db/schema";
import { api, ClientApiError } from "@/lib/client-api";
import type {
  AiVisibilityDashboardResponse,
  AiVisibilityRange,
  AiVisibilityTab,
  BreakdownRow,
  DashboardTableRow,
} from "@/server/ai-visibility/dashboard";
import type {
  AiVisibilityProjectListItem,
  AiVisibilitySettingsView,
} from "@/server/ai-visibility/projects";
import type { AiVisibilityRunView } from "@/server/ai-visibility/runs";
import { useLocale } from "@/i18n/LocaleProvider";
import { translateAiVisibilityText } from "@/i18n/ai-visibility";

interface Props {
  initialFolderId?: string;
  printMode?: boolean;
}

interface PromptRow {
  id: string;
  prompt: string;
  topic: string;
  source: "manual" | "csv" | "position_tracking" | "legacy";
  enabled: boolean;
}

interface RunNotice {
  tone: "success" | "warning";
  message: string;
}

const PROVIDERS: { key: AiVisibilityProvider; label: string; short: string; color: string }[] = [
  { key: "google_aio", label: "Google AI 개요", short: "Google AIO", color: "#6b6de3" },
  { key: "chatgpt_web", label: "ChatGPT 웹 검색", short: "ChatGPT", color: "#3bcfa6" },
  { key: "gemini_grounded", label: "Gemini 검색 그라운딩", short: "Gemini", color: "#b777ed" },
];

const TABS: { key: AiVisibilityTab; label: string }[] = [
  { key: "top_topics", label: "실적이 좋은 주제" },
  { key: "topic_opportunities", label: "주제 기회" },
  { key: "cited_sources", label: "인용된 소스" },
  { key: "source_opportunities", label: "소스 기회" },
  { key: "cited_pages", label: "인용된 페이지" },
];

const CARD = "rounded-[10px] border border-[#e4e6eb] bg-white shadow-[0_1px_2px_rgba(20,28,45,0.03)]";
const BUTTON = "inline-flex h-9 items-center justify-center rounded-[6px] border border-[#d8dbe2] bg-white px-3 text-[13px] font-medium text-[#30343b] transition hover:bg-[#f6f7f9] disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = "inline-flex h-9 items-center justify-center rounded-[6px] bg-[#17191c] px-3.5 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#b7bac1]";

function message(error: unknown, fallback: string, locale: "en" | "ko") {
  if (!(error instanceof ClientApiError)) return fallback;
  return localizedError(error.message, fallback, locale);
}

function localizedError(text: string, fallback: string, locale: "en" | "ko") {
  const localized = translateAiVisibilityText(locale, text);
  return locale === "en" && localized === text && /[가-힣]/u.test(text) ? fallback : localized;
}

function useAiVisibilityText() {
  const { locale } = useLocale();
  return { locale, tx: (text: string) => translateAiVisibilityText(locale, text) };
}

function runOutcome(run: AiVisibilityRunView, locale: "en" | "ko"): RunNotice | null {
  if (run.status === "completed") {
    return { tone: "success", message: translateAiVisibilityText(locale, `실제 추적 ${run.succeeded}건을 완료했습니다.`) };
  }
  if (run.status === "partial") {
    return {
      tone: "warning",
      message: translateAiVisibilityText(locale, `실제 추적을 완료했습니다. 성공 ${run.succeeded}건 · 실패 ${run.failed}건`),
    };
  }
  return null;
}

function compact(value: number, locale: "en" | "ko") {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null, locale: "en" | "ko") {
  if (!value) return translateAiVisibilityText(locale, "수집 전");
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function providerMeta(key: AiVisibilityProvider) {
  return PROVIDERS.find((provider) => provider.key === key)!;
}

function Delta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  const { tx } = useAiVisibilityText();
  if (value === null) return <span className="text-[11px] font-normal text-[#8a9099]">{tx("비교 데이터 없음")}</span>;
  const positive = value > 0;
  return (
    <span className={`text-[11px] font-semibold ${positive ? "text-[#168a65]" : value < 0 ? "text-[#d94f4f]" : "text-[#747a84]"}`}>
      {positive ? "+" : ""}{value}{suffix}
    </span>
  );
}

function Gauge({ value, measured }: { value: number | null; measured: number }) {
  const { tx } = useAiVisibilityText();
  const score = value ?? 0;
  const tone = tx(value === null ? "측정 전" : score >= 70 ? "높음" : score >= 35 ? "중간" : "낮음");
  return (
    <div className={`${CARD} flex min-h-[260px] flex-col p-4`}>
      <h2 className="text-[14px] font-semibold text-[#23272e]">{tx("AI 가시성")} <span className="font-normal text-[#8b9098]">ⓘ</span></h2>
      <div className="mx-auto mt-5 w-full max-w-[230px]">
        <div className="relative h-[116px] overflow-hidden">
          <div
            className="absolute left-1/2 top-0 h-[220px] w-[220px] -translate-x-1/2 rounded-full"
            style={{ background: `conic-gradient(from 270deg, #6b6de3 0deg ${score * 1.8}deg, #d9fbf6 ${score * 1.8}deg 180deg, transparent 180deg 360deg)` }}
          />
          <div className="absolute left-1/2 top-[18px] h-[184px] w-[184px] -translate-x-1/2 rounded-full bg-white" />
          <div className="absolute inset-x-0 top-[67px] text-center">
            <div className="text-[28px] font-bold leading-none text-[#554fd8]">{value === null ? "—" : value}<span className="text-[13px] font-medium text-[#737883]">/100</span></div>
            <div className="mt-1 text-[16px] font-semibold text-[#30343b]">{tone}</div>
          </div>
        </div>
      </div>
      <div className="mt-auto rounded-[7px] bg-[#eef3ff] px-3 py-2.5 text-center text-[11px] leading-4 text-[#535b69]">
        {measured > 0
          ? tx(`측정 가능한 최신 셀 ${measured}개를 기준으로 계산했습니다.`)
          : tx("첫 수집을 완료하면 실제 가시성 점수가 표시됩니다.")}
      </div>
    </div>
  );
}

function Kpi({ label, value, delta, suffix = "" }: { label: string; value: string; delta: number | null; suffix?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-[#737985]">{label} <span className="text-[#a2a6ad]">ⓘ</span></p>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="text-[23px] font-bold tracking-[-0.03em] text-[#5c5bdd]">{value}</span>
        <Delta value={delta} suffix={suffix} />
      </div>
    </div>
  );
}

function TrendCard({ data }: { data: AiVisibilityDashboardResponse }) {
  const { locale, tx } = useAiVisibilityText();
  const [view, setView] = useState<"metrics" | "visibility">("metrics");
  const hasMeasurement = Boolean(data.provenance.lastCollectedAt);
  return (
    <div className={`${CARD} min-h-[260px] p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eef0f3] pb-3">
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
          <Kpi label={tx("AI 가시성")} value={data.kpis.visibility.value === null ? "—" : `${data.kpis.visibility.value}%`} delta={data.kpis.visibility.delta} suffix="%p" />
          <Kpi label={tx("언급")} value={hasMeasurement ? compact(data.kpis.mentions.value, locale) : "—"} delta={data.kpis.mentions.delta} />
          <Kpi label={tx("인용")} value={hasMeasurement ? compact(data.kpis.citations.value, locale) : "—"} delta={data.kpis.citations.delta} />
          <Kpi label={tx("인용된 페이지")} value={hasMeasurement ? compact(data.kpis.citedPages.value, locale) : "—"} delta={data.kpis.citedPages.delta} />
        </div>
        <div className="flex rounded-[6px] border border-[#dfe1e6] p-0.5 text-[10px]">
          <button type="button" onClick={() => setView("metrics")} className={`rounded px-2 py-1 ${view === "metrics" ? "bg-[#eef0ff] font-semibold text-[#5551cd]" : "text-[#707680]"}`}>{tx("주요 측정항목")}</button>
          <button type="button" onClick={() => setView("visibility")} className={`rounded px-2 py-1 ${view === "visibility" ? "bg-[#eef0ff] font-semibold text-[#5551cd]" : "text-[#707680]"}`}>{tx("AI 가시성")}</button>
        </div>
      </div>
      <div className="mt-3 h-[155px]">
        {data.trend.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-[#777d87]">{tx("수집 이력이 아직 없습니다.")}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trend} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#eceef1" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#858a94" }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: "#858a94" }} tickLine={false} axisLine={false} allowDecimals={false} domain={view === "visibility" ? [0, 100] : undefined} />
              <Tooltip contentStyle={{ border: "1px solid #e0e2e7", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {view === "visibility" ? (
                <Line type="monotone" dataKey="visibility" name={tx("AI 가시성 (%)")} stroke="#6b6de3" strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false} />
              ) : (
                <>
                  <Line type="monotone" dataKey="mentions" name={tx("언급")} stroke="#6b6de3" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="citations" name={tx("인용")} stroke="#3bcfa6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="citedPages" name={tx("인용된 페이지")} stroke="#b777ed" strokeWidth={2} dot={false} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function BreakdownCard({ title, rows, kind }: { title: string; rows: BreakdownRow[]; kind: "provider" | "country" }) {
  const { locale, tx } = useAiVisibilityText();
  const colors = ["#6b6de3", "#3bcfa6", "#b777ed", "#f4b21b", "#7094f5"];
  return (
    <div className={`${CARD} p-4`}>
      <h2 className="text-[14px] font-semibold text-[#23272e]">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-12 text-center text-[12px] text-[#818791]">{tx("표시할 실측 데이터가 없습니다.")}</p>
      ) : (
        <>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#f0f1f3]">
            {rows.map((row, index) => (
              <span key={row.key} style={{ width: `${Math.max(2, row.share)}%`, background: kind === "provider" ? providerMeta(row.key as AiVisibilityProvider).color : colors[index % colors.length] }} />
            ))}
          </div>
          <div className="mt-4 divide-y divide-[#eef0f3]">
            {rows.map((row, index) => {
              const color = kind === "provider" ? providerMeta(row.key as AiVisibilityProvider).color : colors[index % colors.length];
              return (
                <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_58px_68px] items-center gap-3 py-2.5 text-[12px]">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="truncate font-medium text-[#3a3f47]">{kind === "provider" ? tx(row.label) : row.label}</span>
                    </div>
                    <div className="ml-[18px] mt-1 h-1.5 overflow-hidden rounded-full bg-[#eceef1]"><div className="h-full rounded-full" style={{ width: `${row.share}%`, background: color }} /></div>
                  </div>
                  <span className="text-right text-[#626873]">{row.share}%</span>
                  <span className="text-right font-semibold text-[#4f57cf]">{locale === "ko" ? `언급 ${row.mentions}회` : `${row.mentions} mentions`}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ActionsCard({ data }: { data: AiVisibilityDashboardResponse }) {
  const { tx } = useAiVisibilityText();
  return (
    <aside className={`${CARD} overflow-hidden lg:row-span-2`}>
      <div className="border-b border-[#d9d4fb] bg-[#efedff] px-4 py-3">
        <h2 className="text-[14px] font-semibold text-[#30343b]">{tx("다음 단계")}</h2>
      </div>
      <div className="space-y-2.5 p-3">
        {data.actions.map((action) => (
          <div key={action.id} className="rounded-[7px] border border-[#cfd7ff] p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-[#845df5]">✦</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-5 text-[#343941]">{tx(action.title)}</h3>
                <p className="mt-1 text-[11px] leading-[17px] text-[#59616d]">{tx(action.description)}</p>
                <a href={action.href} className="mt-3 inline-block text-[11px] font-semibold text-[#2563eb] hover:underline">{tx(action.cta)}</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function CompletenessBanner({ data }: { data: AiVisibilityDashboardResponse }) {
  const { locale } = useAiVisibilityText();
  const { completeness } = data;
  if (completeness.expectedCells === 0 || (completeness.ratio === 100 && completeness.measurementRatio === 100 && completeness.failedItems === 0)) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#f0d59d] bg-[#fff9e9] px-4 py-3 text-[12px] text-[#6c5722]">
      <span>
        {locale === "ko" ? `완전성 ${completeness.ratio}% · 측정 가능 ${completeness.measurementRatio}%` : `Completeness ${completeness.ratio}% · Measurable ${completeness.measurementRatio}%`}
        {completeness.failedItems > 0 ? (locale === "ko" ? ` · 최근 실행 실패 ${completeness.failedItems}건` : ` · ${completeness.failedItems} failed in the latest run`) : ""}
      </span>
      <span className="text-[#806b34]">{locale === "ko" ? `unknown ${completeness.unknownCells}건은 가시성 점수 분모에서 제외됩니다.` : `${completeness.unknownCells} unknown cells are excluded from the visibility score denominator.`}</span>
      {data.latestRun?.error && <span className="w-full text-[#9a5b21]">{locale === "ko" ? `최근 실행 사유: ${data.latestRun.error}` : `Latest run reason: ${localizedError(data.latestRun.error, "The latest collection failed. Check the provider connection and try again.", locale)}`}</span>}
    </div>
  );
}

function ResultsTable({ data, q, onQ, onTab, onPage }: {
  data: AiVisibilityDashboardResponse;
  q: string;
  onQ: (value: string) => void;
  onTab: (tab: AiVisibilityTab) => void;
  onPage: (page: number) => void;
}) {
  const { locale, tx } = useAiVisibilityText();
  return (
    <section className="mt-7 print:mt-4">
      <h2 className="text-[18px] font-semibold text-[#262a31]">{tx("주제 및 출처")}</h2>
      <div className={`mt-3 ${CARD} overflow-hidden`}>
        <div className="flex overflow-x-auto border-b border-[#e5e7eb]">
          {TABS.map((item) => {
            const active = data.table.tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTab(item.key)}
                className={`min-w-[180px] flex-1 border-r border-[#e5e7eb] px-4 py-3 text-left text-[12px] ${active ? "bg-[#f3f5ff] font-semibold text-[#454bc2] shadow-[inset_0_-2px_0_#6b6de3]" : "text-[#656c76] hover:bg-[#fafafa]"}`}
              >
                {tx(item.label)} <span className="float-right font-normal text-[#8a9099]">{data.tabs[item.key].count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceef1] px-4 py-3 print:hidden">
          <div>
            <p className="text-[14px] font-semibold text-[#30343b]">{tx(TABS.find((item) => item.key === data.table.tab)?.label ?? "")}</p>
            <p className="mt-0.5 text-[11px] text-[#838993]">{tx("최신 실측 셀 기준 · 추정 소스 없음")}</p>
          </div>
          <input
            value={q}
            onChange={(event) => onQ(event.target.value)}
            placeholder={tx("결과 검색")}
            className="h-8 w-[230px] rounded-[6px] border border-[#d9dce2] px-3 text-[12px] outline-none focus:border-[#6b6de3]"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[12px]">
            <thead className="bg-[#f6f7f8] text-[#666d78]">
              <tr>
                <th className="px-4 py-2.5 font-medium">{tx("항목")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{tx("가시성")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{tx("언급")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{tx("인용")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{tx("인용 페이지")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{tx("Google 검색 수요")}</th>
                <th className="px-4 py-2.5 font-medium">{tx("플랫폼·국가")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eceef1]">
              {data.table.rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-14 text-center text-[#818791]">{tx("현재 필터에서 실제 관측 결과가 없습니다.")}</td></tr>
              ) : data.table.rows.map((row) => <ResultRow key={row.id} row={row} />)}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[#eceef1] px-4 py-3 text-[11px] text-[#747b85] print:hidden">
          <span>{locale === "ko" ? `총 ${data.pagination.total}개` : `${data.pagination.total} total`}</span>
          <div className="flex items-center gap-2">
            <button className={BUTTON} disabled={data.pagination.page <= 1} onClick={() => onPage(data.pagination.page - 1)}>{tx("이전")}</button>
            <span>{data.pagination.page} / {data.pagination.totalPages}</span>
            <button className={BUTTON} disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => onPage(data.pagination.page + 1)}>{tx("다음")}</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ResultRow({ row }: { row: DashboardTableRow }) {
  const { locale } = useAiVisibilityText();
  return (
    <tr className="hover:bg-[#fafbfc]">
      <td className="max-w-[420px] px-4 py-3">
        {row.href ? <a href={row.href} target="_blank" rel="noreferrer" className="font-medium text-[#343942] hover:text-[#315be8] hover:underline">{row.label}</a> : <span className="font-medium text-[#343942]">{row.label}</span>}
        {row.detail && <p className="mt-0.5 truncate text-[10px] text-[#8a9099]">{row.detail}</p>}
      </td>
      <td className="px-3 py-3 text-right font-semibold text-[#555bd5]">{row.visibility === null ? "—" : `${row.visibility}%`}</td>
      <td className="px-3 py-3 text-right text-[#555b65]">{row.mentions}</td>
      <td className="px-3 py-3 text-right text-[#555b65]">{row.citations}</td>
      <td className="px-3 py-3 text-right text-[#555b65]">{row.citedPages}</td>
      <td className="px-3 py-3 text-right text-[#555b65]">{row.googleDemand === null ? "—" : compact(row.googleDemand, locale)}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {row.providers.map((provider) => <span key={provider} className="rounded bg-[#eef0ff] px-1.5 py-0.5 text-[9px] text-[#555bd5]">{providerMeta(provider).short}</span>)}
          {row.countries.map((country) => <span key={country} className="rounded bg-[#f0f2f4] px-1.5 py-0.5 text-[9px] text-[#656b75]">{country}</span>)}
        </div>
      </td>
    </tr>
  );
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += char;
  }
  values.push(value.trim());
  return values;
}

function PromptManager({
  fid,
  prompts,
  limit,
  positionTrackingImport,
  onChanged,
}: {
  fid: string;
  prompts: PromptRow[];
  limit: number;
  positionTrackingImport: AiVisibilitySettingsView["imports"]["positionTracking"];
  onChanged: () => Promise<void>;
}) {
  const { locale, tx } = useAiVisibilityText();
  const [value, setValue] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (rows: { prompt: string; topic?: string }[], source: "manual" | "csv") => {
    if (rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/ai-visibility/prompts/?fid=${encodeURIComponent(fid)}`, { mode: "prompts", source, prompts: rows });
      setValue("");
      setTopic("");
      await onChanged();
    } catch (cause) {
      setError(message(cause, tx("프롬프트를 추가하지 못했습니다."), locale));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
    const parsed = lines.map(splitCsvLine);
    const hasHeader = parsed[0]?.some((cell) => /prompt|프롬프트|topic|주제/i.test(cell));
    const header = hasHeader ? parsed.shift()!.map((cell) => cell.toLocaleLowerCase()) : [];
    const promptIndex = Math.max(0, header.findIndex((cell) => /prompt|프롬프트/.test(cell)));
    const topicIndex = header.findIndex((cell) => /topic|주제/.test(cell));
    await submit(parsed.map((row) => ({ prompt: row[promptIndex] ?? "", topic: topicIndex >= 0 ? row[topicIndex] : undefined })).filter((row) => row.prompt), "csv");
  };

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#292d34]">{tx("추적 프롬프트")}</h2>
          <p className="mt-1 text-[11px] text-[#767d87]">{locale === "ko" ? `중복을 정규화해 제거하며 프로젝트당 최대 ${limit}개입니다. 현재 ${prompts.length}개` : `Duplicates are normalized and removed. Up to ${limit} prompts per project · ${prompts.length} currently`}</p>
        </div>
        <div className="flex gap-2">
          <button className={BUTTON} title={positionTrackingImport.reason ? tx(positionTrackingImport.reason) : undefined} disabled={busy || prompts.length >= limit || !positionTrackingImport.available} onClick={async () => {
            setBusy(true); setError(null);
            try { await api.post(`/api/ai-visibility/prompts/?fid=${encodeURIComponent(fid)}`, { mode: "position_tracking" }); await onChanged(); }
            catch (cause) { setError(message(cause, tx("포지션 추적 키워드를 가져오지 못했습니다."), locale)); }
            finally { setBusy(false); }
          }}>{tx("포지션 추적에서 가져오기")}{positionTrackingImport.available ? ` (${positionTrackingImport.keywordCount})` : ""}</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
          <button className={BUTTON} disabled={busy || prompts.length >= limit} onClick={() => fileRef.current?.click()}>{tx("CSV 업로드")}</button>
        </div>
      </div>
      {!positionTrackingImport.available && positionTrackingImport.reason && (
        <p className="mt-2 text-[11px] text-[#8a6b32]">{tx("포지션 추적 가져오기 비활성")}: {tx(positionTrackingImport.reason)}</p>
      )}
      {error && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
        <textarea value={value} onChange={(event) => setValue(event.target.value)} rows={2} placeholder={tx("프롬프트를 줄바꿈으로 입력")} className="rounded-[6px] border border-[#d9dce2] px-3 py-2 text-[12px] outline-none focus:border-[#6b6de3]" />
        <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={tx("주제 태그 (선택)")} className="h-10 rounded-[6px] border border-[#d9dce2] px-3 text-[12px] outline-none focus:border-[#6b6de3]" />
        <button className={PRIMARY} disabled={busy || !value.trim() || prompts.length >= limit} onClick={() => void submit(value.split(/\r?\n/).map((prompt) => ({ prompt, topic })).filter((row) => row.prompt.trim()), "manual")}>{tx("추가")}</button>
      </div>
      {prompts.length > 0 && (
        <div className="mt-4 max-h-[260px] divide-y divide-[#eceef1] overflow-y-auto border-t border-[#eceef1]">
          {prompts.map((prompt) => (
            <div key={prompt.id} className="flex items-center gap-3 py-2.5 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-[#3c4149]">{prompt.prompt}</span>
              <span className="rounded bg-[#f0f2f5] px-2 py-0.5 text-[10px] text-[#68707a]">{prompt.topic}</span>
              <span className="hidden text-[10px] text-[#9297a0] sm:inline">{prompt.source}</span>
              <button className="text-[11px] text-[#cc4d4d] hover:underline" onClick={async () => { await api.delete(`/api/ai-visibility/prompts/${prompt.id}/?fid=${encodeURIComponent(fid)}`); await onChanged(); }}>{tx("삭제")}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ settings, onSaved }: { settings: AiVisibilitySettingsView; onSaved: () => Promise<void> }) {
  const { locale, tx } = useAiVisibilityText();
  const project = settings.project;
  const [brandName, setBrandName] = useState(project?.brandName ?? settings.defaults.brandName);
  const [aliases, setAliases] = useState((project?.brandAliases ?? []).join(", "));
  const [providers, setProviders] = useState<AiVisibilityProvider[]>(project?.providers ?? settings.defaults.providers);
  const [locations, setLocations] = useState<string[]>(project?.locationKeys ?? settings.defaults.locationKeys);
  const [schedule, setSchedule] = useState<"off" | "weekly">(project?.schedule ?? settings.defaults.schedule);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleProvider = (provider: AiVisibilityProvider) => {
    setProviders((current) => current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider]);
  };
  const toggleLocation = (key: string) => {
    setLocations((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length < settings.limits.scopes ? [...current, key] : current);
  };

  return (
    <div className={`${CARD} p-6`}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7770d8]">{tx("프로젝트 설정")}</p>
        <h2 className="mt-1 text-[20px] font-semibold text-[#252930]">{project ? tx("AI 가시성 설정") : locale === "ko" ? `${settings.folder.name} 측정을 시작하세요` : `Start measuring ${settings.folder.name}`}</h2>
        <p className="mt-1 text-[12px] text-[#737a85]">{tx("브랜드, 실제 수집 플랫폼, 대표 국가를 지정합니다. 키가 없는 플랫폼은 선택할 수 없습니다.")}</p>
      </div>
      {error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <label className="text-[12px] font-medium text-[#4e555f]">{tx("브랜드명")}
          <input value={brandName} onChange={(event) => setBrandName(event.target.value)} className="mt-1.5 h-10 w-full rounded-[6px] border border-[#d9dce2] px-3 font-normal outline-none focus:border-[#6b6de3]" />
        </label>
        <label className="text-[12px] font-medium text-[#4e555f]">{locale === "ko" ? `브랜드 별칭 (쉼표 구분, 최대 ${settings.limits.aliases}개)` : `Brand aliases (comma-separated, up to ${settings.limits.aliases})`}
          <input value={aliases} onChange={(event) => setAliases(event.target.value)} className="mt-1.5 h-10 w-full rounded-[6px] border border-[#d9dce2] px-3 font-normal outline-none focus:border-[#6b6de3]" />
        </label>
        <fieldset>
          <legend className="text-[12px] font-medium text-[#4e555f]">{tx("AI 플랫폼")}</legend>
          <div className="mt-2 space-y-2">
            {PROVIDERS.map((provider) => {
              const capability = settings.capabilities.providers[provider.key];
              return (
                <label key={provider.key} className={`flex items-start gap-2 rounded-[6px] border px-3 py-2.5 ${capability.enabled ? "border-[#e0e2e7]" : "border-[#ececee] bg-[#fafafa] text-[#9297a0]"}`}>
                  <input type="checkbox" checked={providers.includes(provider.key)} disabled={!capability.enabled} onChange={() => toggleProvider(provider.key)} className="mt-0.5" />
                  <span className="text-[12px]"><b className="font-medium">{tx(provider.label)}</b>{!capability.enabled && <span className="mt-0.5 block text-[10px]">{tx(capability.reason ?? "")}</span>}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[12px] font-medium text-[#4e555f]">{locale === "ko" ? `국가 (최대 ${settings.limits.scopes}개)` : `Countries (up to ${settings.limits.scopes})`}</legend>
          <div className="mt-2 max-h-[172px] space-y-1.5 overflow-y-auto rounded-[6px] border border-[#e0e2e7] p-2">
            {settings.locations.map((location) => {
              const sameCountrySelected = locations.some((key) => settings.locations.find((item) => item.key === key)?.countryCode === location.countryCode && key !== location.key);
              return (
                <label key={location.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] hover:bg-[#f6f7f9]">
                  <input type="checkbox" checked={locations.includes(location.key)} disabled={!locations.includes(location.key) && (locations.length >= settings.limits.scopes || sameCountrySelected)} onChange={() => toggleLocation(location.key)} />
                  <span>{location.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eceef1] pt-4">
        <label className="flex items-center gap-2 text-[12px] text-[#525963]">
          {tx("자동 수집")}
          <select value={schedule} onChange={(event) => setSchedule(event.target.value as "off" | "weekly")} className="h-9 rounded-[6px] border border-[#d9dce2] bg-white px-2">
            <option value="weekly">{tx("매주")}</option><option value="off">{tx("사용 안 함")}</option>
          </select>
        </label>
        <button className={PRIMARY} disabled={busy || !brandName.trim() || providers.length === 0 || locations.length === 0} onClick={async () => {
          setBusy(true); setError(null);
          try {
            await api.put(`/api/ai-visibility/settings/?fid=${encodeURIComponent(settings.folder.id)}`, {
              brandName,
              brandAliases: aliases.split(",").map((item) => item.trim()).filter(Boolean),
              providers,
              locationKeys: locations,
              schedule,
            });
            await onSaved();
          } catch (cause) { setError(message(cause, tx("설정을 저장하지 못했습니다."), locale)); }
          finally { setBusy(false); }
        }}>{tx(busy ? "저장 중…" : project ? "설정 저장" : "프로젝트 설정 완료")}</button>
      </div>
    </div>
  );
}

function RunProgress({ run }: { run: AiVisibilityRunView }) {
  const { locale, tx } = useAiVisibilityText();
  const progress = run.total > 0 ? Math.round((run.processed / run.total) * 100) : 0;
  return (
    <div className="rounded-[8px] border border-[#cfd7ff] bg-[#f4f6ff] px-4 py-3 text-[12px] text-[#454b64]">
      <div className="flex justify-between"><span>{run.currentPrompt ? (locale === "ko" ? `수집 중: ${run.currentPrompt}` : `Collecting: ${run.currentPrompt}`) : tx("수집 큐 처리 중")}</span><b>{run.processed}/{run.total}</b></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dce1ff]"><div className="h-full bg-[#6565de] transition-all" style={{ width: `${progress}%` }} /></div>
      {run.failed > 0 && <p className="mt-2 text-[#b36a20]">{locale === "ko" ? `실패 ${run.failed}건 · 성공한 플랫폼 결과는 보존됩니다.` : `${run.failed} failed · Successful platform results are preserved.`}</p>}
    </div>
  );
}

function OnboardingGuide({
  configured,
  promptCount,
  collected,
  collecting,
  onSettings,
  onPrompts,
  onCollect,
}: {
  configured: boolean;
  promptCount: number;
  collected: boolean;
  collecting: boolean;
  onSettings: () => void;
  onPrompts: () => void;
  onCollect: () => void;
}) {
  const { tx } = useAiVisibilityText();
  const steps = [
    { number: 1, title: tx("브랜드·국가·플랫폼 설정"), done: configured, description: tx("측정할 브랜드와 실제 연결 가능한 데이터 소스를 확인합니다.") },
    { number: 2, title: tx("추적 프롬프트 등록"), done: promptCount > 0, description: tx("직접 입력, CSV 또는 연결된 포지션 추적에서 최대 20개를 등록합니다.") },
    { number: 3, title: tx("첫 실측 수집"), done: collected, description: tx("승인한 프롬프트만 플랫폼·국가별로 수집해 개요를 만듭니다.") },
  ];
  return (
    <section className={`${CARD} mt-4 overflow-hidden border-[#d9d4fb] bg-gradient-to-r from-white to-[#faf9ff]`}>
      <div className="border-b border-[#ece9ff] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7770d8]">{tx("시작 가이드")}</p>
        <h2 className="mt-1 text-[17px] font-semibold text-[#292d34]">{tx("실제 AI 응답 수집을 3단계로 시작하세요")}</h2>
        <p className="mt-1 text-[11px] text-[#747b85]">{tx("프롬프트를 자동 생성하거나 승인 없이 수집하지 않습니다.")}</p>
      </div>
      <div className="grid gap-px bg-[#eceef2] md:grid-cols-3">
        {steps.map((step) => (
          <div key={step.number} className="bg-white px-5 py-4">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${step.done ? "bg-[#ddf7ef] text-[#168a65]" : "bg-[#eeedff] text-[#5b58d6]"}`}>{step.done ? "✓" : step.number}</span>
              <h3 className="text-[12px] font-semibold text-[#383d45]">{step.title}</h3>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[#747b85]">{step.description}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2 px-5 py-3 print:hidden">
        {!configured ? <button className={PRIMARY} onClick={onSettings}>{tx("1단계 설정 열기")}</button>
          : promptCount === 0 ? <button className={PRIMARY} onClick={onPrompts}>{tx("2단계 프롬프트 등록")}</button>
            : !collected ? <button className={PRIMARY} disabled={collecting} onClick={onCollect}>{tx(collecting ? "수집 중…" : "3단계 첫 실측 수집")}</button>
              : null}
      </div>
    </section>
  );
}

function MeasurementDiagnostics({ data }: { data: AiVisibilityDashboardResponse }) {
  const { locale, tx } = useAiVisibilityText();
  return (
    <section id="measurement-diagnostics" className={`${CARD} mt-3 scroll-mt-24 overflow-hidden`}>
      <div className="border-b border-[#eceef1] px-4 py-3">
        <h2 className="text-[14px] font-semibold text-[#30343b]">{tx("측정 불가 셀")}</h2>
        <p className="mt-1 text-[11px] text-[#747b85]">{tx("공급자가 인용 정보를 제공하지 않아 점수 분모에서 제외된 실제 관측입니다.")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-[11px]">
          <thead className="bg-[#f6f7f8] text-[#666d78]"><tr><th className="px-4 py-2 font-medium">{tx("프롬프트")}</th><th className="px-3 py-2 font-medium">{tx("플랫폼")}</th><th className="px-3 py-2 font-medium">{tx("국가")}</th><th className="px-3 py-2 font-medium">{tx("수집 출처")}</th><th className="px-4 py-2 font-medium">{tx("수집 시각")}</th></tr></thead>
          <tbody className="divide-y divide-[#eceef1]">
            {data.diagnostics.unknownCells.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[#818791]">{tx("현재 필터에서 측정 불가 셀이 없습니다.")}</td></tr>
            ) : data.diagnostics.unknownCells.map((row) => (
              <tr key={row.id}><td className="max-w-[360px] truncate px-4 py-2.5 text-[#343942]">{row.prompt}</td><td className="px-3 py-2.5">{providerMeta(row.provider).short}</td><td className="px-3 py-2.5">{row.countryCode}</td><td className="px-3 py-2.5">{tx(row.source)}</td><td className="px-4 py-2.5">{formatDate(row.capturedAt, locale)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AiVisibilityDashboard({ initialFolderId = "", printMode = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, tx } = useAiVisibilityText();
  const measurementFilter = searchParams.get("measurement") === "unknown" ? "unknown" : "";
  const [projects, setProjects] = useState<AiVisibilityProjectListItem[]>([]);
  const [fid, setFid] = useState(initialFolderId);
  const [settings, setSettings] = useState<AiVisibilitySettingsView | null>(null);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [dashboard, setDashboard] = useState<AiVisibilityDashboardResponse | null>(null);
  const [range, setRange] = useState<AiVisibilityRange>((searchParams.get("range") as AiVisibilityRange) || "1m");
  const [tab, setTab] = useState<AiVisibilityTab>((searchParams.get("tab") as AiVisibilityTab) || "top_topics");
  const [countries, setCountries] = useState<string[]>(searchParams.get("countries")?.split(",").filter(Boolean) ?? []);
  const [providers, setProviders] = useState<AiVisibilityProvider[]>((searchParams.get("providers")?.split(",").filter(Boolean) ?? []) as AiVisibilityProvider[]);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [run, setRun] = useState<AiVisibilityRunView | null>(null);
  const [startingRun, setStartingRun] = useState(false);
  const [runNotice, setRunNotice] = useState<RunNotice | null>(null);
  const [dashboardVersion, setDashboardVersion] = useState(0);

  const loadProjects = async () => {
    const response = await api.get<AiVisibilityProjectListItem[]>("/api/ai-visibility/projects/");
    setProjects(response.data);
    if (!fid && response.data.length > 0) {
      const selected = response.data.find((project) => project.configured) ?? response.data[0];
      setFid(selected.id);
    }
  };

  const loadFolder = async (folderId: string) => {
    const [settingsResponse, projectsResponse] = await Promise.all([
      api.get<AiVisibilitySettingsView>(`/api/ai-visibility/settings/?fid=${encodeURIComponent(folderId)}`),
      api.get<AiVisibilityProjectListItem[]>("/api/ai-visibility/projects/"),
    ]);
    setSettings(settingsResponse.data);
    setProjects(projectsResponse.data);
    if (settingsResponse.data.project) {
      const promptResponse = await api.get<PromptRow[]>(`/api/ai-visibility/prompts/?fid=${encodeURIComponent(folderId)}`);
      setPrompts(promptResponse.data);
    } else {
      setPrompts([]);
      setDashboard(null);
    }
  };

  const refreshPrompts = async () => {
    if (!fid) return;
    const response = await api.get<PromptRow[]>(`/api/ai-visibility/prompts/?fid=${encodeURIComponent(fid)}`);
    setPrompts(response.data);
  };

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      try { await loadProjects(); }
      catch (cause) { if (active) setError(message(cause, translateAiVisibilityText(locale, "프로젝트를 불러오지 못했습니다."), locale)); }
      finally { if (active) setLoading(false); }
    });
    return () => { active = false; };
    // 최초 프로젝트 목록만 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fid) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true); setError(null); setSettings(null); setDashboard(null);
      try { await loadFolder(fid); }
      catch (cause) { if (active) setError(message(cause, translateAiVisibilityText(locale, "프로젝트 설정을 불러오지 못했습니다."), locale)); }
      finally { if (active) setLoading(false); }
    });
    return () => { active = false; };
  }, [fid, locale]);

  useEffect(() => {
    if (!fid || !settings?.project) return;
    let active = true;
    const params = new URLSearchParams({ fid, range, tab, page: String(page) });
    if (countries.length) params.set("countries", countries.join(","));
    if (providers.length) params.set("providers", providers.join(","));
    if (q.trim()) params.set("q", q.trim());
    if (measurementFilter) params.set("measurement", measurementFilter);
    router.replace(`${printMode ? "/ai-seo/overview/print/" : "/ai-seo/overview/"}?${params.toString()}`, { scroll: false });
    api.get<AiVisibilityDashboardResponse>(`/api/ai-visibility/overview/?${params.toString()}`)
      .then(({ data }) => { if (active) setDashboard(data); })
      .catch((cause) => { if (active) setError(message(cause, translateAiVisibilityText(locale, "AI 가시성 개요를 불러오지 못했습니다."), locale)); });
    return () => { active = false; };
  }, [fid, settings?.project, range, tab, page, q, countries, providers, router, printMode, dashboardVersion, measurementFilter, locale]);

  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const timer = window.setInterval(() => {
      api.get<AiVisibilityRunView>(`/api/ai-visibility/runs/${run.id}/`).then(async ({ data }) => {
        setRun(data);
        if (data.status !== "queued" && data.status !== "running") {
          window.clearInterval(timer);
          if (fid) {
            await loadFolder(fid);
            setDashboardVersion((version) => version + 1);
          }
          const outcome = runOutcome(data, locale);
          if (outcome) setRunNotice(outcome);
          else setError(data.error ? localizedError(data.error, tx("실제 추적을 완료하지 못했습니다."), locale) : tx("실제 추적을 완료하지 못했습니다."));
        }
      }).catch((cause) => {
        window.clearInterval(timer);
        setRun(null);
        setError(message(cause, tx("수집 상태를 확인하지 못했습니다. 다시 시도해 주세요."), locale));
      });
    }, 1800);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.status, fid]);

  const selectedCountries = useMemo(
    () => countries.length ? countries : dashboard?.scope.countries ?? [],
    [countries, dashboard?.scope.countries],
  );
  const selectedProviders = useMemo(
    () => providers.length ? providers : dashboard?.scope.providers ?? [],
    [providers, dashboard?.scope.providers],
  );
  const exportQuery = useMemo(() => {
    if (!fid) return "";
    const params = new URLSearchParams({ fid, range, tab });
    if (selectedCountries.length) params.set("countries", selectedCountries.join(","));
    if (selectedProviders.length) params.set("providers", selectedProviders.join(","));
    if (q.trim()) params.set("q", q.trim());
    return params.toString();
  }, [fid, range, tab, selectedCountries, selectedProviders, q]);

  const selectProject = (folderId: string) => {
    setFid(folderId); setRun(null); setRunNotice(null); setCountries([]); setProviders([]); setPage(1); setQ("");
    router.push(`/ai-seo/overview/?fid=${encodeURIComponent(folderId)}&range=1m&tab=top_topics&page=1`);
  };

  const startCollection = async () => {
    if (!fid || startingRun || run?.status === "queued" || run?.status === "running") return;
    setStartingRun(true);
    setRunNotice(null);
    setError(null);
    try {
      const { data } = await api.post<{ runId: string }>("/api/ai-visibility/runs/", { fid });
      const status = await api.get<AiVisibilityRunView>(`/api/ai-visibility/runs/${data.runId}/`);
      setRun(status.data);
      if (status.data.status !== "queued" && status.data.status !== "running") {
        await loadFolder(fid);
        setDashboardVersion((version) => version + 1);
        const outcome = runOutcome(status.data, locale);
        if (outcome) setRunNotice(outcome);
        else setError(status.data.error ? localizedError(status.data.error, tx("실제 추적을 완료하지 못했습니다."), locale) : tx("실제 추적을 완료하지 못했습니다."));
      }
    } catch (cause) {
      setError(message(cause, tx("수집을 시작하지 못했습니다."), locale));
    } finally {
      setStartingRun(false);
    }
  };

  if (loading && !settings) {
    return <div className="flex min-h-[520px] items-center justify-center bg-[#f5f6f7] text-[13px] text-[#747b85]">{tx("AI 가시성 프로젝트를 불러오는 중…")}</div>;
  }

  if (error && projects.length === 0) {
    return (
      <div className="min-h-[calc(100dvh-56px)] bg-[#f5f6f7] p-6">
        <div className={`mx-auto max-w-3xl ${CARD} p-8 text-center`}>
          <h1 className="text-[22px] font-semibold text-[#252930]">{tx("AI 가시성을 불러오지 못했습니다")}</h1>
          <p className="mt-2 text-[13px] text-red-700">{error}</p>
          <a href="/login/" className={`${PRIMARY} mt-5`}>{tx("로그인으로 이동")}</a>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="min-h-[calc(100dvh-56px)] bg-[#f5f6f7] p-6">
        <div className={`mx-auto max-w-3xl ${CARD} p-8 text-center`}>
          <h1 className="text-[22px] font-semibold text-[#252930]">{tx("먼저 프로젝트 폴더를 만들어 주세요")}</h1>
          <p className="mt-2 text-[13px] text-[#737a85]">{tx("AI 가시성은 폴더 도메인과 소유권을 기준으로 실제 인용을 판정합니다.")}</p>
          <a href="/projects/" className={`${PRIMARY} mt-5`}>{tx("프로젝트로 이동")}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-[#f5f6f7] text-[#2e333a] print:bg-white">
      <div className="mx-auto w-full max-w-[1520px] px-4 py-5 sm:px-6 print:max-w-none print:p-0">
        {printMode && <div className="mb-4 flex justify-end print:hidden"><button className={PRIMARY} onClick={() => window.print()}>{tx("인쇄 / PDF 저장")}</button></div>}
        <header className="print:mb-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#818791] print:hidden"><span>{tx("홈")}</span><span>›</span><span>{tx("AI 가시성")}</span><span>›</span><b className="font-medium text-[#555b65]">{tx("가시성 개요")}</b></div>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[#292d34]">{tx("가시성 개요")}{settings ? `: ${settings.folder.domain}` : ""}</h1>
              <p className="mt-1 text-[11px] text-[#7b818b]">{tx("실제 AI 응답의 브랜드 언급과 자사 도메인 인용만 집계합니다.")}</p>
            </div>
            {!printMode && <div className="flex flex-wrap items-center gap-2 print:hidden">
              <select value={fid} onChange={(event) => selectProject(event.target.value)} className="h-9 min-w-[220px] rounded-[6px] border border-[#d7dae0] bg-white px-3 text-[12px]">
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.domain}</option>)}
              </select>
              <button className={BUTTON} onClick={() => setShowSettings((value) => !value)}>{tx("설정")}</button>
              <button className={BUTTON} onClick={() => setShowPrompts((value) => !value)}>{tx("프롬프트")} {prompts.length}</button>
              <a className={BUTTON} href={exportQuery ? `/api/ai-visibility/export.csv/?${exportQuery}` : "#"}>{tx("CSV 내보내기")}</a>
              <button className={BUTTON} onClick={() => window.open(`/ai-seo/overview/print/?${exportQuery}`, "_blank", "noopener,noreferrer")}>{tx("PDF로 저장")}</button>
              <button
                className={PRIMARY}
                disabled={!settings?.project || prompts.length === 0 || startingRun || run?.status === "queued" || run?.status === "running"}
                onClick={startCollection}
              >
                {tx(startingRun ? "수집 시작 중…" : run?.status === "queued" || run?.status === "running" ? "수집 중…" : "지금 수집")}
              </button>
            </div>}
          </div>
        </header>

        {error && <div className="mt-4 rounded-[7px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">{error}</div>}
        {runNotice && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-[7px] border px-4 py-3 text-[12px] ${runNotice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
          >
            {runNotice.message}
          </div>
        )}
        {!printMode && settings && (!settings.project || prompts.length === 0 || !dashboard?.provenance.lastCollectedAt) && (
          <OnboardingGuide
            configured={Boolean(settings.project)}
            promptCount={prompts.length}
            collected={Boolean(dashboard?.provenance.lastCollectedAt)}
            collecting={startingRun || run?.status === "queued" || run?.status === "running"}
            onSettings={() => setShowSettings(true)}
            onPrompts={() => setShowPrompts(true)}
            onCollect={() => void startCollection()}
          />
        )}
        {!printMode && settings && (!settings.project || showSettings) && <div className="mt-4"><SettingsPanel settings={settings} onSaved={async () => { await loadFolder(fid); setShowSettings(false); }} /></div>}
        {!printMode && settings?.project && (showPrompts || prompts.length === 0) && <div className="mt-4"><PromptManager fid={fid} prompts={prompts} limit={settings.limits.prompts} positionTrackingImport={settings.imports.positionTracking} onChanged={refreshPrompts} /></div>}
        {run && (run.status === "queued" || run.status === "running") && <div className="mt-4"><RunProgress run={run} /></div>}

        {dashboard && settings?.project && (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#e1e3e8] bg-white px-3 py-2 print:hidden">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-[#737985]">{tx("국가")}</span>
                {dashboard.scope.configuredLocations.map((location) => {
                  const active = selectedCountries.includes(location.countryCode);
                  return <button key={location.key} onClick={() => { setPage(1); setCountries(active && selectedCountries.length > 1 ? selectedCountries.filter((item) => item !== location.countryCode) : active ? selectedCountries : [...selectedCountries, location.countryCode]); }} className={`h-7 rounded-[5px] border px-2.5 text-[11px] ${active ? "border-[#7774e8] bg-[#f0efff] font-semibold text-[#5551cd]" : "border-[#dedfe4] text-[#6c727d]"}`}>{location.countryCode}</button>;
                })}
                <span className="ml-2 text-[11px] font-medium text-[#737985]">{tx("플랫폼")}</span>
                {dashboard.scope.configuredProviders.map((provider) => {
                  const active = selectedProviders.includes(provider);
                  const capability = dashboard.capabilities.providers[provider];
                  return <button key={provider} title={capability.reason ? tx(capability.reason) : undefined} onClick={() => { setPage(1); setProviders(active && selectedProviders.length > 1 ? selectedProviders.filter((item) => item !== provider) : active ? selectedProviders : [...selectedProviders, provider]); }} className={`h-7 rounded-[5px] border px-2.5 text-[11px] ${active ? "border-[#7774e8] bg-[#f0efff] font-semibold text-[#5551cd]" : "border-[#dedfe4] text-[#6c727d]"}`}>{providerMeta(provider).short}{!capability.enabled ? ` · ${tx("비활성")}` : ""}</button>;
                })}
              </div>
              <div className="flex items-center gap-2">
                <select value={range} onChange={(event) => { setRange(event.target.value as AiVisibilityRange); setPage(1); }} className="h-8 rounded-[6px] border border-[#d8dbe1] bg-white px-2 text-[11px]"><option value="1m">{tx("1개월")}</option><option value="6m">{tx("6개월")}</option><option value="all">{tx("전체 (400일)")}</option></select>
                <span className="text-[10px] text-[#858b95]">{tx("최근 수집")} {formatDate(dashboard.provenance.lastCollectedAt, locale)}</span>
              </div>
            </div>

            <CompletenessBanner data={dashboard} />
            {measurementFilter && <MeasurementDiagnostics data={dashboard} />}
            <div id="overview-results" className="mt-3 grid scroll-mt-24 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-3"><Gauge value={dashboard.kpis.visibility.value} measured={dashboard.kpis.visibility.measured} /></div>
              <div className="lg:col-span-6"><TrendCard data={dashboard} /></div>
              <div className="lg:col-span-3"><ActionsCard data={dashboard} /></div>
              <div className="lg:col-span-4"><BreakdownCard title={tx("LLM별 언급 분포")} rows={dashboard.providerBreakdown} kind="provider" /></div>
              <div className="lg:col-span-5"><BreakdownCard title={tx("국가별 언급")} rows={dashboard.countryBreakdown} kind="country" /></div>
            </div>
            <div className="mt-3 rounded-[8px] border border-[#c9d8ff] bg-gradient-to-r from-[#f4efff] to-[#eef8ff] px-4 py-3 text-[11px] text-[#59616c] print:hidden">
              {tx("가시성 공식")}: {tx(dashboard.provenance.formula)} · {tx("보존")} {dashboard.provenance.retentionDays} {tx("일")} · {dashboard.provenance.sources.map((source) => tx(source.source)).join(" / ")}
            </div>
            <div id="topic-and-sources" className="scroll-mt-24"><ResultsTable data={dashboard} q={q} onQ={(value) => { setQ(value); setPage(1); }} onTab={(value) => { setTab(value); setPage(1); }} onPage={setPage} /></div>
          </>
        )}
      </div>
    </div>
  );
}
