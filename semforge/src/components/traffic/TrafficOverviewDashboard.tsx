"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/client-api";

const CARD = "rounded-xl border border-zinc-200 bg-white p-5";
const LABEL = "text-xs font-medium text-zinc-500";
const VALUE = "mt-1 text-2xl font-semibold text-zinc-900";

interface GscStatusEnvelope {
  connected?: boolean;
  siteUrl?: string | null;
  email?: string | null;
}
interface ProviderEnvelope<T> {
  status: "live" | "unavailable" | "error";
  data?: T;
  reason?: string;
}
interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function fmtInt(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(Date.now() - 27 * 24 * 60 * 60 * 1000);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

export function TrafficOverviewDashboard({ initialSiteUrl = "" }: { initialSiteUrl?: string }) {
  const [status, setStatus] = useState<GscStatusEnvelope | null>(null);
  const [siteUrl, setSiteUrl] = useState(initialSiteUrl);
  const [siteUrlInput, setSiteUrlInput] = useState(initialSiteUrl);
  const [range, setRange] = useState(defaultRange);
  const [trend, setTrend] = useState<GscRow[]>([]);
  const [queries, setQueries] = useState<GscRow[]>([]);
  const [pages, setPages] = useState<GscRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ProviderEnvelope<GscStatusEnvelope> | GscStatusEnvelope>("/api/gsc/status/")
      .then(({ data }) => {
        const envelope = data as ProviderEnvelope<GscStatusEnvelope>;
        const payload = (envelope.data ?? data) as GscStatusEnvelope;
        setStatus(payload);
        if (!siteUrl && payload.siteUrl) {
          setSiteUrl(payload.siteUrl);
          setSiteUrlInput(payload.siteUrl);
        }
      })
      .catch(() => setStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (target: string, current: { start: string; end: string }) => {
    if (!target) return;
    setLoading(true);
    setReason(null);
    const base = `/api/gsc/query/?siteUrl=${encodeURIComponent(target)}&startDate=${current.start}&endDate=${current.end}`;
    try {
      const [dateRes, queryRes, pageRes] = await Promise.all([
        api.get<ProviderEnvelope<{ rows: GscRow[] }>>(`${base}&dimensions=date&rowLimit=100`),
        api.get<ProviderEnvelope<{ rows: GscRow[] }>>(`${base}&dimensions=query&rowLimit=25`),
        api.get<ProviderEnvelope<{ rows: GscRow[] }>>(`${base}&dimensions=page&rowLimit=25`),
      ]);
      const unavailable = [dateRes.data, queryRes.data, pageRes.data].find(
        (item) => item.status !== "live"
      );
      if (unavailable) {
        setReason(unavailable.reason ?? "Search Console 데이터를 가져올 수 없습니다.");
        setTrend([]);
        setQueries([]);
        setPages([]);
        return;
      }
      const sortByDate = (rows: GscRow[]) =>
        [...rows].sort((a, b) => (a.keys[0] ?? "").localeCompare(b.keys[0] ?? ""));
      const byClicks = (a: GscRow, b: GscRow) => b.clicks - a.clicks;
      setTrend(sortByDate(dateRes.data.data?.rows ?? []));
      setQueries([...(queryRes.data.data?.rows ?? [])].sort(byClicks));
      setPages([...(pageRes.data.data?.rows ?? [])].sort(byClicks));
    } catch {
      setReason("Search Console 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive && siteUrl && status?.connected) void load(siteUrl, range);
    });
    return () => {
      alive = false;
    };
  }, [siteUrl, range, status?.connected, load]);

  const totals = trend.reduce(
    (acc, row) => ({
      clicks: acc.clicks + row.clicks,
      impressions: acc.impressions + row.impressions,
    }),
    { clicks: 0, impressions: 0 }
  );
  const avgCtr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const avgPosition =
    trend.length > 0
      ? trend.reduce((sum, row) => sum + row.position * row.impressions, 0) /
        Math.max(1, totals.impressions)
      : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Traffic &amp; Market</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">트래픽 개요{siteUrl ? `: ${siteUrl}` : ""}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Google Search Console 실측 기반의 검색 유입 지표입니다.
        </p>
      </header>

      {status && !status.connected && (
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-900">Search Console 미연결</p>
          <p className="mt-1 text-sm text-zinc-500">
            소유 사이트의 클릭·노출·평균 포지션 실데이터를 보려면 Google 계정을 연결하세요.
          </p>
          {/* OAuth 시작은 API 라우트의 302 리다이렉트가 필요해 전체 페이지 이동이 맞다. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/gsc/auth/start"
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Google 계정 연결
          </a>
        </div>
      )}

      {status?.connected && (
        <form
          className="mb-6 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSiteUrl(siteUrlInput.trim());
          }}
        >
          <input
            value={siteUrlInput}
            onChange={(event) => setSiteUrlInput(event.target.value)}
            placeholder="속성 URL (예: sc-domain:example.com)"
            className="h-10 w-80 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
          <input
            type="date"
            value={range.start}
            onChange={(event) => setRange((prev) => ({ ...prev, start: event.target.value }))}
            className="h-10 rounded-lg border border-zinc-300 px-2 text-sm"
          />
          <span className="text-sm text-zinc-400">~</span>
          <input
            type="date"
            value={range.end}
            onChange={(event) => setRange((prev) => ({ ...prev, end: event.target.value }))}
            className="h-10 rounded-lg border border-zinc-300 px-2 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
          >
            조회
          </button>
        </form>
      )}

      {reason && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {reason}
        </div>
      )}

      {status?.connected && siteUrl && (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className={CARD}>
              <p className={LABEL}>클릭</p>
              <p className={VALUE}>{fmtInt(totals.clicks)}</p>
            </div>
            <div className={CARD}>
              <p className={LABEL}>노출</p>
              <p className={VALUE}>{fmtInt(totals.impressions)}</p>
            </div>
            <div className={CARD}>
              <p className={LABEL}>평균 CTR</p>
              <p className={VALUE}>{(avgCtr * 100).toFixed(1)}%</p>
            </div>
            <div className={CARD}>
              <p className={LABEL}>평균 포지션</p>
              <p className={VALUE}>{avgPosition > 0 ? avgPosition.toFixed(1) : "—"}</p>
            </div>
          </section>

          <section className={`${CARD} mb-6`}>
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">일별 검색 유입 추이</h2>
            {loading ? (
              <p className="text-sm text-zinc-500">불러오는 중…</p>
            ) : trend.length === 0 ? (
              <p className="text-sm text-zinc-500">선택한 기간의 Search Console 데이터가 없습니다.</p>
            ) : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey={(row: GscRow) => row.keys[0] ?? ""} tick={{ fontSize: 11, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#71717a" }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="clicks" stroke="#ea580c" fill="#ffedd5" name="클릭" />
                    <Area type="monotone" dataKey="impressions" stroke="#52525b" fill="#f4f4f5" name="노출" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            <section className={CARD}>
              <h2 className="mb-3 text-sm font-semibold text-zinc-900">상위 검색어</h2>
              {queries.length === 0 ? (
                <p className="text-sm text-zinc-500">데이터가 없습니다.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                      <th className="py-2 pr-3 font-medium">검색어</th>
                      <th className="py-2 pr-3 font-medium">클릭</th>
                      <th className="py-2 pr-3 font-medium">노출</th>
                      <th className="py-2 font-medium">포지션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queries.slice(0, 10).map((row) => (
                      <tr key={row.keys[0]} className="border-b border-zinc-100 last:border-0">
                        <td className="max-w-40 truncate py-2 pr-3 text-zinc-800">{row.keys[0]}</td>
                        <td className="py-2 pr-3 text-zinc-600">{fmtInt(row.clicks)}</td>
                        <td className="py-2 pr-3 text-zinc-600">{fmtInt(row.impressions)}</td>
                        <td className="py-2 text-zinc-600">{row.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className={CARD}>
              <h2 className="mb-3 text-sm font-semibold text-zinc-900">상위 페이지</h2>
              {pages.length === 0 ? (
                <p className="text-sm text-zinc-500">데이터가 없습니다.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                      <th className="py-2 pr-3 font-medium">페이지</th>
                      <th className="py-2 pr-3 font-medium">클릭</th>
                      <th className="py-2 font-medium">노출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.slice(0, 10).map((row) => (
                      <tr key={row.keys[0]} className="border-b border-zinc-100 last:border-0">
                        <td className="max-w-52 truncate py-2 pr-3 text-zinc-800">{row.keys[0]}</td>
                        <td className="py-2 pr-3 text-zinc-600">{fmtInt(row.clicks)}</td>
                        <td className="py-2 text-zinc-600">{fmtInt(row.impressions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
            이 대시보드는 Google 검색 유입(Search Console)만 표시합니다. 전체 방문 추정·채널별
            트래픽·경쟁사 트래픽은 무료 데이터 소스가 없어 SEMForge에서 제공하지 않습니다.
          </p>
        </>
      )}
    </div>
  );
}
