"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";

type LoadStatus = "loading" | "live" | "unavailable" | "error";

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface ProviderPayload<T> {
  status: "live" | "unavailable" | "error";
  data?: T;
  source: string;
  fetchedAt: string;
  reason?: string;
}

interface GscStatusData {
  connected: boolean;
  siteUrl?: string;
  email?: string;
}

interface ViewState {
  status: LoadStatus;
  reason: string | null;
  siteUrl: string | null;
  fetchedAt: string | null;
  rows: GscRow[];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function queryPeriod(): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

const initialState: ViewState = {
  status: "loading",
  reason: null,
  siteUrl: null,
  fetchedAt: null,
  rows: [],
};

export function OrganicTrafficInsightsDashboard({ domain }: { domain: string }) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [state, setState] = useState<ViewState>(initialState);
  const period = useMemo(() => queryPeriod(), []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const statusResponse = await fetch("/api/gsc/status/", {
          cache: "no-store",
          signal: controller.signal,
        });
        const statusPayload = (await statusResponse.json()) as ProviderPayload<GscStatusData>;
        if (statusPayload.status !== "live") {
          setState({
            ...initialState,
            status: statusPayload.status,
            reason: statusPayload.reason ?? null,
            fetchedAt: statusPayload.fetchedAt,
          });
          return;
        }
        if (!statusPayload.data?.connected) {
          setState({
            ...initialState,
            status: "unavailable",
            reason: ko
              ? "Google Search Console 계정이 아직 연결되지 않았습니다."
              : "A Google Search Console account has not been connected yet.",
            fetchedAt: statusPayload.fetchedAt,
          });
          return;
        }

        const params = new URLSearchParams({
          startDate: period.startDate,
          endDate: period.endDate,
          dimensions: "query,page",
          rowLimit: "100",
        });
        const queryResponse = await fetch(`/api/gsc/query/?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const queryPayload = (await queryResponse.json()) as ProviderPayload<{ rows: GscRow[] }>;
        setState({
          status: queryPayload.status,
          reason: queryPayload.reason ?? null,
          siteUrl: statusPayload.data.siteUrl ?? null,
          fetchedAt: queryPayload.fetchedAt,
          rows: queryPayload.data?.rows ?? [],
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          ...initialState,
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    void load();
    return () => controller.abort();
  }, [ko, period.endDate, period.startDate]);

  const totals = useMemo(() => {
    const clicks = state.rows.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = state.rows.reduce((sum, row) => sum + row.impressions, 0);
    const weightedPosition = state.rows.reduce(
      (sum, row) => sum + row.position * row.impressions,
      0,
    );
    return {
      clicks,
      impressions,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      position: impressions > 0 ? weightedPosition / impressions : null,
    };
  }, [state.rows]);
  const number = (value: number | null, digits = 0) =>
    value === null
      ? ko
        ? "미제공"
        : "Unavailable"
      : new Intl.NumberFormat(ko ? "ko-KR" : "en-US", {
          maximumFractionDigits: digits,
        }).format(value);
  const connectHref = `/api/gsc/auth/start/?siteUrl=${encodeURIComponent(`sc-domain:${domain}`)}`;

  return (
    <div className="p-6 text-app-text">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[12px] text-app-text-secondary">
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${
                state.status === "live"
                  ? "bg-[#e9f7ef] text-[#08783e]"
                  : "bg-[#f0f1f4] text-app-text-secondary"
              }`}
            >
              {state.status === "loading"
                ? ko
                  ? "연결 확인 중"
                  : "Checking connection"
                : state.status === "live"
                  ? ko
                    ? "Google 실측 데이터"
                    : "Live Google data"
                  : ko
                    ? "연결 필요"
                    : "Connection required"}
            </span>
            <span>{period.startDate} – {period.endDate}</span>
          </div>
          <h1 className="text-[22px] font-semibold leading-[30px]">
            {ko ? "자연 검색 트래픽 인사이트" : "Organic Traffic Insights"}
          </h1>
          <p className="mt-1 max-w-[760px] text-[13px] leading-5 text-app-text-secondary">
            {ko
              ? "연결된 Google Search Console의 쿼리·페이지별 클릭과 노출을 표시합니다. Google Analytics 데이터는 별도 연결이 생기기 전까지 제공하지 않습니다."
              : "Shows query and page clicks and impressions from the connected Google Search Console. Google Analytics data remains unavailable until a separate connection exists."}
          </p>
        </div>
        {state.status !== "live" && (
          <a
            href={connectHref}
            className="inline-flex h-9 items-center rounded-[6px] bg-[#1a1e1a] px-4 text-[13px] font-medium text-white"
          >
            {ko ? "Search Console 연결" : "Connect Search Console"}
          </a>
        )}
      </div>

      <section className="mt-5 rounded-[8px] border border-app-border bg-white p-4 text-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold">Google Search Console</span>
            <span className="ml-2 text-app-text-secondary">
              {state.siteUrl ?? domain}
            </span>
          </div>
          <span className="text-[11px] text-app-text-secondary">
            {state.fetchedAt
              ? new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(state.fetchedAt))
              : null}
          </span>
        </div>
        {state.reason && <p className="mt-2 text-app-text-secondary">{state.reason}</p>}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [ko ? "클릭" : "Clicks", number(state.status === "live" ? totals.clicks : null)],
          [ko ? "노출" : "Impressions", number(state.status === "live" ? totals.impressions : null)],
          [ko ? "CTR" : "CTR", `${number(state.status === "live" ? totals.ctr : null, 2)}${totals.ctr !== null && state.status === "live" ? "%" : ""}`],
          [ko ? "평균 게재순위" : "Average position", number(state.status === "live" ? totals.position : null, 2)],
        ].map(([label, value]) => (
          <section key={label} className="rounded-[8px] border border-app-border bg-white p-4">
            <p className="text-[12px] text-app-text-secondary">{label}</p>
            <p className="mt-1 text-[22px] font-semibold">{value}</p>
          </section>
        ))}
      </div>

      <section className="mt-5 overflow-hidden rounded-[8px] border border-app-border bg-white">
        <div className="border-b border-app-border px-4 py-3">
          <h2 className="text-[14px] font-semibold">
            {ko ? "Search Console 쿼리·페이지" : "Search Console queries and pages"}
          </h2>
        </div>
        {state.rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[15px] font-semibold">
              {state.status === "loading"
                ? ko
                  ? "데이터를 확인하고 있습니다"
                  : "Checking data"
                : ko
                  ? "표시할 실제 Search Console 행이 없습니다"
                  : "No Search Console rows are available"}
            </p>
            <p className="mx-auto mt-2 max-w-[620px] text-[13px] leading-5 text-app-text-secondary">
              {ko
                ? "연결되지 않은 지표를 임의 값으로 채우지 않았습니다."
                : "Disconnected metrics were not filled with invented values."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12px]">
              <thead className="bg-app-bg text-app-text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">{ko ? "쿼리" : "Query"}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{ko ? "페이지" : "Page"}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{ko ? "클릭" : "Clicks"}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{ko ? "노출" : "Impressions"}</th>
                  <th className="px-4 py-2.5 text-right font-medium">CTR</th>
                  <th className="px-4 py-2.5 text-right font-medium">{ko ? "순위" : "Position"}</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row, index) => (
                  <tr key={`${row.keys.join("|")}-${index}`} className="border-t border-app-border">
                    <td className="px-4 py-3">{row.keys[0] ?? "—"}</td>
                    <td className="max-w-[360px] truncate px-4 py-3">{row.keys[1] ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{number(row.clicks)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{number(row.impressions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{number(row.ctr * 100, 2)}%</td>
                    <td className="px-4 py-3 text-right tabular-nums">{number(row.position, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-[8px] border border-app-border bg-white p-4">
        <h2 className="text-[14px] font-semibold">Google Analytics</h2>
        <p className="mt-1 text-[13px] text-app-text-secondary">
          {ko
            ? "GA4 속성 연결과 조회 공급자가 아직 구현·설정되지 않아 세션 및 전환 데이터는 미제공입니다."
            : "Session and conversion data is unavailable because a GA4 property connection and query provider are not yet implemented or configured."}
        </p>
      </section>
    </div>
  );
}
