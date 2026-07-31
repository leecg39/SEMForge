"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AiDomainDiagnosticsPanel } from "@/components/ai-visibility/AiDomainDiagnosticsPanel";
import { api, ClientApiError } from "@/lib/client-api";
import type { AiVisibilityDomainDiagnostic } from "@/server/ai-visibility/domain-diagnostic";
import type { AiVisibilityOverview } from "@/server/ai-visibility/overview";

interface Props {
  initialDomain?: string;
}

const CARD = "rounded-xl border border-zinc-200 bg-white p-5";
const LABEL = "text-xs font-medium text-zinc-500";
const VALUE = "mt-1 text-2xl font-semibold text-zinc-900";

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: "live" | "muted" | "warn" }) {
  const styles =
    tone === "live"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-zinc-100 text-zinc-500 border-zinc-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}

function CitedCell({ cited }: { cited: boolean | null }) {
  if (cited === true) return <StatusBadge tone="live">인용됨</StatusBadge>;
  if (cited === false) return <StatusBadge tone="muted">미인용</StatusBadge>;
  return <StatusBadge tone="warn">판정 불가</StatusBadge>;
}

export function AiVisibilityDashboard({ initialDomain = "" }: Props) {
  const [domain, setDomain] = useState(initialDomain);
  const [domainInput, setDomainInput] = useState(initialDomain);
  const [overview, setOverview] = useState<AiVisibilityOverview | null>(null);
  const [diagnostic, setDiagnostic] = useState<AiVisibilityDomainDiagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newQuery, setNewQuery] = useState("");
  const [newCountry, setNewCountry] = useState("KR");
  const [newDevice, setNewDevice] = useState<"desktop" | "mobile">("desktop");

  const load = useCallback(async (target: string) => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<AiVisibilityOverview>(
        `/api/ai-visibility/overview/?domain=${encodeURIComponent(target)}`
      );
      setOverview(data);
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "개요를 불러오지 못했습니다.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDiagnostic = useCallback(async (target: string) => {
    if (!target) return;
    setDiagnosticLoading(true);
    setDiagnosticError(null);
    try {
      const { data } = await api.post<AiVisibilityDomainDiagnostic>(
        "/api/ai-visibility/domain-diagnostics/",
        { domain: target }
      );
      setDiagnostic(data);
    } catch (cause) {
      setDiagnosticError(
        cause instanceof ClientApiError
          ? cause.message
          : "AI 검색 접근성 진단을 실행하지 못했습니다."
      );
      setDiagnostic(null);
    } finally {
      setDiagnosticLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive && domain) {
        void load(domain);
        void loadDiagnostic(domain);
      }
    });
    return () => {
      alive = false;
    };
  }, [domain, load, loadDiagnostic]);

  const submitDomain = () => {
    const target = domainInput.trim();
    if (!target) {
      setDomain("");
      setOverview(null);
      setDiagnostic(null);
      setError(null);
      setDiagnosticError(null);
      return;
    }
    if (target === domain) {
      void load(target);
      void loadDiagnostic(target);
      return;
    }
    setOverview(null);
    setDiagnostic(null);
    setDomain(target);
  };

  const addQuery = async () => {
    if (!newQuery.trim() || !domain) return;
    setError(null);
    try {
      await api.post("/api/ai-visibility/queries/", {
        domain,
        query: newQuery,
        countryCode: newCountry,
        device: newDevice,
      });
      setNewQuery("");
      await load(domain);
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "쿼리 추가에 실패했습니다.");
    }
  };

  const removeQuery = async (id: string) => {
    setError(null);
    try {
      await api.delete(`/api/ai-visibility/queries/${id}/`);
      await load(domain);
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "삭제에 실패했습니다.");
    }
  };

  const collect = async () => {
    if (!domain) return;
    setCollecting(true);
    setError(null);
    setNotice(null);
    try {
      const { data } = await api.post<{ collected: number; failed: number }>(
        "/api/ai-visibility/collect/",
        { domain }
      );
      setNotice(
        data.failed > 0
          ? `수집 ${data.collected}건 완료, ${data.failed}건 실패 (제공사 오류는 잠시 후 재시도)`
          : `수집 ${data.collected}건 완료`
      );
      await load(domain);
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "수집에 실패했습니다.");
    } finally {
      setCollecting(false);
    }
  };

  const stats = overview?.stats;
  const trend = useMemo(() => overview?.trend ?? [], [overview]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">AI Visibility</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">AI 가시성{domain ? `: ${domain}` : ""}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Google AI 개요(AIO) 출현과 자사 도메인의 인용 여부를 실제 SERP 수집으로만 추적합니다.
        </p>
      </header>

      <form
        className="mb-6 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submitDomain();
        }}
      >
        <input
          value={domainInput}
          onChange={(event) => setDomainInput(event.target.value)}
          placeholder="도메인 입력 (예: example.com)"
          aria-label="진단할 도메인"
          className="h-10 w-72 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
        />
        <button
          type="submit"
          disabled={loading || diagnosticLoading}
          className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {loading || diagnosticLoading ? "불러오는 중…" : "불러오기"}
        </button>
        {domain && (
          <button
            type="button"
            onClick={collect}
            disabled={collecting || (stats?.queryCount ?? 0) === 0}
            className="h-10 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {collecting ? "수집 중…" : "지금 수집"}
          </button>
        )}
      </form>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {domain && (
        <AiDomainDiagnosticsPanel
          domain={domain}
          report={diagnostic}
          loading={diagnosticLoading}
          error={diagnosticError}
          onRefresh={() => void loadDiagnostic(domain)}
        />
      )}

      {!domain && (
        <div className={`${CARD} text-sm text-zinc-500`}>
          추적할 도메인을 입력하면 AIO 출현/인용 실측 데이터를 보여 드립니다.
        </div>
      )}

      {domain && loading && <div role="status" className={`${CARD} text-sm text-zinc-500`}>AIO 개요를 불러오는 중…</div>}

      {domain && !loading && overview && (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className={CARD}>
              <p className={LABEL}>추적 쿼리</p>
              <p className={VALUE}>{stats?.queryCount ?? 0}</p>
            </div>
            <div className={CARD}>
              <p className={LABEL}>AIO 출현</p>
              <p className={VALUE}>{stats?.aioCount ?? 0}</p>
              <p className="mt-0.5 text-xs text-zinc-400">최신 스냅샷 기준</p>
            </div>
            <div className={CARD}>
              <p className={LABEL}>AIO 인용됨</p>
              <p className={VALUE}>{stats?.citedCount ?? 0}</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                판정 가능 {stats?.judgeableAioCount ?? 0}건 중
              </p>
            </div>
            <div className={CARD}>
              <p className={LABEL}>판정 불가</p>
              <p className={VALUE}>{stats?.unknownCitationCount ?? 0}</p>
              <p className="mt-0.5 text-xs text-zinc-400">제공사가 AIO 본문 미제공</p>
            </div>
          </section>

          {stats?.lastCollectedAt && (
            <p className="mb-4 text-xs text-zinc-400">
              최근 수집: {new Date(stats.lastCollectedAt).toLocaleString("ko-KR")} · 소스: talordata
            </p>
          )}

          <section className={`${CARD} mb-6`}>
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">AIO 출현 추이</h2>
            {trend.length === 0 ? (
              <p className="text-sm text-zinc-500">
                아직 수집 이력이 없습니다. 쿼리를 추가하고 “지금 수집”을 실행하세요.
              </p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#71717a" }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="collected" stroke="#a1a1aa" fill="#f4f4f5" name="수집 쿼리" />
                    <Area type="monotone" dataKey="aioPresent" stroke="#ea580c" fill="#ffedd5" name="AIO 출현" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {(overview.topCitedDomains.length > 0 || true) && (
            <section className={`${CARD} mb-6`}>
              <h2 className="mb-3 text-sm font-semibold text-zinc-900">AIO 인용 소스 상위 도메인</h2>
              {overview.topCitedDomains.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  아직 인용 소스가 확인되지 않았습니다. 제공사가 AIO 본문을 제공하는 수집부터 표시됩니다.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {overview.topCitedDomains.map((item) => (
                    <li key={item.domain} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-zinc-800">{item.domain}</span>
                      <span className="text-zinc-500">{item.count}건</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className={`${CARD} mb-6`}>
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">추적 쿼리 추가</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newQuery}
                onChange={(event) => setNewQuery(event.target.value)}
                placeholder="쿼리 (예: 브랜드명, 제품 질문)"
                className="h-10 w-64 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
              />
              <select
                value={newCountry}
                onChange={(event) => setNewCountry(event.target.value)}
                className="h-10 rounded-lg border border-zinc-300 px-2 text-sm"
              >
                <option value="KR">한국(KR)</option>
                <option value="US">미국(US)</option>
              </select>
              <select
                value={newDevice}
                onChange={(event) => setNewDevice(event.target.value as "desktop" | "mobile")}
                className="h-10 rounded-lg border border-zinc-300 px-2 text-sm"
              >
                <option value="desktop">데스크톱</option>
                <option value="mobile">모바일</option>
              </select>
              <button
                type="button"
                onClick={addQuery}
                disabled={!newQuery.trim()}
                className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                추가
              </button>
            </div>
          </section>

          <section className={CARD}>
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">쿼리별 상태</h2>
            {overview.queries.length === 0 ? (
              <p className="text-sm text-zinc-500">추적 중인 쿼리가 없습니다. 위에서 첫 쿼리를 추가하세요.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                      <th className="py-2 pr-4 font-medium">쿼리</th>
                      <th className="py-2 pr-4 font-medium">범위</th>
                      <th className="py-2 pr-4 font-medium">AIO</th>
                      <th className="py-2 pr-4 font-medium">인용</th>
                      <th className="py-2 pr-4 font-medium">오가닉 순위</th>
                      <th className="py-2 pr-4 font-medium">최근 수집</th>
                      <th className="py-2 font-medium">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.queries.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-zinc-800">{row.query}</td>
                        <td className="py-2.5 pr-4 text-zinc-500">
                          {row.countryCode} · {row.device === "mobile" ? "모바일" : "데스크톱"}
                        </td>
                        <td className="py-2.5 pr-4">
                          {row.aioPresent === null ? (
                            <StatusBadge tone="muted">수집 전</StatusBadge>
                          ) : row.aioPresent ? (
                            <StatusBadge tone="live">출현</StatusBadge>
                          ) : (
                            <StatusBadge tone="muted">없음</StatusBadge>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          {row.aioPresent === null || row.aioPresent === false ? (
                            <span className="text-xs text-zinc-400">—</span>
                          ) : (
                            <CitedCell cited={row.cited} />
                          )}
                          {row.citedUrl && (
                            <a
                              href={row.citedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block max-w-56 truncate text-xs text-blue-600 hover:underline"
                            >
                              {row.citedUrl}
                            </a>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-700">
                          {row.organicPosition ?? <span className="text-zinc-400">—</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-zinc-500">
                          {row.lastCapturedAt
                            ? new Date(row.lastCapturedAt).toLocaleString("ko-KR")
                            : "—"}
                        </td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() => removeQuery(row.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
