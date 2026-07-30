"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ClientApiError } from "@/lib/client-api";
import type { MapRankOverview } from "@/server/maprank/overview";

const CARD = "rounded-xl border border-zinc-200 bg-white p-5";
const LABEL = "text-xs font-medium text-zinc-500";
const VALUE = "mt-1 text-2xl font-semibold text-zinc-900";

export function MapRankDashboard() {
  const [overview, setOverview] = useState<MapRankOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [locationText, setLocationText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<MapRankOverview>("/api/map-rank/overview/");
      setOverview(data);
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "개요를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) void load();
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const addKeyword = async () => {
    if (!businessName.trim() || !keyword.trim()) return;
    setError(null);
    try {
      await api.post("/api/map-rank/keywords/", { businessName, keyword, locationText });
      setKeyword("");
      await load();
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "키워드 추가에 실패했습니다.");
    }
  };

  const removeKeyword = async (id: string) => {
    setError(null);
    try {
      await api.delete(`/api/map-rank/keywords/${id}/`);
      await load();
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "삭제에 실패했습니다.");
    }
  };

  const collect = async () => {
    setCollecting(true);
    setError(null);
    setNotice(null);
    try {
      const { data } = await api.post<{ collected: number; failed: number }>(
        "/api/map-rank/collect/",
        {}
      );
      setNotice(
        data.failed > 0
          ? `수집 ${data.collected}건 완료, ${data.failed}건 실패 (제공사 오류는 잠시 후 재시도)`
          : `수집 ${data.collected}건 완료`
      );
      await load();
    } catch (cause) {
      setError(cause instanceof ClientApiError ? cause.message : "수집에 실패했습니다.");
    } finally {
      setCollecting(false);
    }
  };

  const stats = overview?.stats;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Local</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">지도 순위 추적</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Google 로컬팩(지도 3팩)에서 내 사업체의 노출 순위를 실제 SERP 수집으로 추적합니다.
        </p>
      </header>

      <div className="mb-6 flex items-center gap-2">
        <button
          type="button"
          onClick={collect}
          disabled={collecting || (stats?.keywordCount ?? 0) === 0}
          className="h-10 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {collecting ? "수집 중…" : "지금 수집"}
        </button>
        {stats?.lastCollectedAt && (
          <span className="text-xs text-zinc-400">
            최근 수집: {new Date(stats.lastCollectedAt).toLocaleString("ko-KR")} · 소스: talordata
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={CARD}>
          <p className={LABEL}>추적 키워드</p>
          <p className={VALUE}>{stats?.keywordCount ?? 0}</p>
        </div>
        <div className={CARD}>
          <p className={LABEL}>로컬팩 출현</p>
          <p className={VALUE}>{stats?.localPackCount ?? 0}</p>
        </div>
        <div className={CARD}>
          <p className={LABEL}>팩 내 노출</p>
          <p className={VALUE}>{stats?.inPackCount ?? 0}</p>
        </div>
        <div className={CARD}>
          <p className={LABEL}>최고 순위</p>
          <p className={VALUE}>{stats?.bestPosition ?? "—"}</p>
        </div>
      </section>

      <section className={`${CARD} mb-6`}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">팩 내 노출 추이</h2>
        {!overview || overview.trend.length === 0 ? (
          <p className="text-sm text-zinc-500">
            아직 수집 이력이 없습니다. 키워드를 추가하고 “지금 수집”을 실행하세요.
          </p>
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview.trend} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#71717a" }} />
                <Tooltip />
                <Area type="monotone" dataKey="collected" stroke="#a1a1aa" fill="#f4f4f5" name="수집 키워드" />
                <Area type="monotone" dataKey="inPack" stroke="#ea580c" fill="#ffedd5" name="팩 내 노출" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className={`${CARD} mb-6`}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">추적 키워드 추가</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            placeholder="사업체명 (로컬팩 표시명)"
            className="h-10 w-56 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="키워드 (예: 강아지 동물병원)"
            className="h-10 w-56 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
          <input
            value={locationText}
            onChange={(event) => setLocationText(event.target.value)}
            placeholder="지역 (선택, 예: 강남구)"
            className="h-10 w-44 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
          <button
            type="button"
            onClick={addKeyword}
            disabled={!businessName.trim() || !keyword.trim()}
            className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            추가
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          좌표 그리드 단위의 정밀 지도 순위는 현재 SERP 제공사가 지원하지 않아, 지역어를 포함한 검색 기준으로 근사합니다.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">키워드별 상태</h2>
        {loading ? (
          <p className="text-sm text-zinc-500">불러오는 중…</p>
        ) : !overview || overview.keywords.length === 0 ? (
          <p className="text-sm text-zinc-500">추적 중인 키워드가 없습니다. 위에서 첫 키워드를 추가하세요.</p>
        ) : (
          <div className="space-y-4">
            {overview.keywords.map((row) => (
              <div key={row.id} className="rounded-lg border border-zinc-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-zinc-900">{row.keyword}</span>
                    <span className="ml-2 text-xs text-zinc-400">
                      {row.businessName}
                      {row.locationText ? ` · ${row.locationText}` : ""} · {row.countryCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {row.localPackPresent === null ? (
                      <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                        수집 전
                      </span>
                    ) : row.businessPosition !== null ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        로컬팩 {row.businessPosition}위
                      </span>
                    ) : row.localPackPresent ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        팩 밖 (팩 출현, 미노출)
                      </span>
                    ) : (
                      <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                        로컬팩 없음
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeKeyword(row.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  </div>
                </div>
                {row.businesses.length > 0 && (
                  <ul className="mt-3 divide-y divide-zinc-100 border-t border-zinc-100 pt-2">
                    {row.businesses.map((business) => (
                      <li
                        key={`${row.id}-${business.position}`}
                        className="flex items-center justify-between py-1.5 text-sm"
                      >
                        <span className="text-zinc-700">
                          <span className="mr-2 text-xs text-zinc-400">{business.position}</span>
                          {business.title}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {business.rating !== null ? `★ ${business.rating}` : ""}
                          {business.reviewsCount !== null ? ` (리뷰 ${business.reviewsCount})` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
