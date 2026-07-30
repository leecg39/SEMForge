"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { GbpConnectionCard, useGbpStatus } from "@/components/local/GbpConnectionCard";
import type { MapRankOverview } from "@/server/maprank/overview";

export function LocalOverviewDashboard() {
  const { status } = useGbpStatus();
  const [mapRank, setMapRank] = useState<MapRankOverview | null>(null);
  const [locationCount, setLocationCount] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<MapRankOverview>("/api/map-rank/overview/")
      .then(({ data }) => setMapRank(data))
      .catch(() => setMapRank(null));
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    api
      .get<{ locations: unknown[] }>("/api/gbp/locations/")
      .then(({ data }) => setLocationCount(data.locations.length))
      .catch(() => setLocationCount(null));
  }, [status?.connected]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Local</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">지역 대시보드</h1>
        <p className="mt-1 text-sm text-zinc-500">
          리스팅·리뷰·지도 순위의 실데이터 상태를 한눈에 확인합니다.
        </p>
      </header>

      <div className="mb-6">
        <GbpConnectionCard status={status} />
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <a
          href="/listings-management/"
          className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400"
        >
          <p className="text-sm font-semibold text-zinc-900">리스팅 관리</p>
          <p className="mt-1 text-xs text-zinc-500">Google Business Profile 위치 목록</p>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">
            {status?.connected ? (locationCount ?? "…") : "—"}
          </p>
          <p className="text-xs text-zinc-400">{status?.connected ? "등록 위치" : "연결 후 표시"}</p>
        </a>
        <a
          href="/review-management/"
          className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400"
        >
          <p className="text-sm font-semibold text-zinc-900">리뷰 관리</p>
          <p className="mt-1 text-xs text-zinc-500">평점·리뷰 조회 및 답글</p>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">{status?.connected ? "실시간" : "—"}</p>
          <p className="text-xs text-zinc-400">{status?.connected ? "GBP 연동" : "연결 후 표시"}</p>
        </a>
        <a
          href="/map-rank-tracker/"
          className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400"
        >
          <p className="text-sm font-semibold text-zinc-900">지도 순위 추적</p>
          <p className="mt-1 text-xs text-zinc-500">로컬팩 노출 실측 (talordata)</p>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">
            {mapRank?.stats.inPackCount ?? 0}
            <span className="text-sm font-normal text-zinc-400"> / {mapRank?.stats.keywordCount ?? 0}</span>
          </p>
          <p className="text-xs text-zinc-400">팩 내 노출 키워드 / 전체 추적 키워드</p>
        </a>
      </section>
    </div>
  );
}
