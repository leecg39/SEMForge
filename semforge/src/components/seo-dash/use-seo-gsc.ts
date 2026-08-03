"use client";

import { useCallback, useEffect, useState } from "react";
import {
  gscCoversDomain,
  pickGscSiteForDomain,
} from "@/components/position-tracking/use-gsc-keyword-metrics";

export interface SeoGscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SeoGscTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SeoGscPage {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SeoGscLiveData {
  siteUrl: string;
  email?: string;
  range: { start: string; end: string };
  totals: SeoGscTotals;
  daily: { date: string; clicks: number; impressions: number }[];
  pages: SeoGscPage[];
}

export type SeoGscDashboardState =
  | { kind: "checking" }
  | { kind: "loading"; siteUrl: string; email?: string }
  | { kind: "disconnected"; reason?: string }
  | { kind: "mismatch"; siteUrl: string; email?: string }
  | ({ kind: "live" } & SeoGscLiveData)
  | ({ kind: "empty" } & SeoGscLiveData)
  | { kind: "error"; reason: string };

export function pendingSeoGscState(domain: string): SeoGscDashboardState {
  return domain.trim() ? { kind: "checking" } : { kind: "disconnected" };
}

interface ProviderBody<T> {
  status?: string;
  data?: T;
  reason?: string;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function summarizeGscRows(rows: SeoGscRow[]): SeoGscTotals {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weightedPosition += row.position * row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

export function buildTopGscPages(rows: SeoGscRow[], limit = 5): SeoGscPage[] {
  return rows
    .filter((row) => Boolean(row.keys[0]))
    .map((row) => ({
      page: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr * 100,
      position: row.position,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.page.localeCompare(b.page))
    .slice(0, limit);
}

async function readProvider<T>(response: Response): Promise<ProviderBody<T>> {
  try {
    return (await response.json()) as ProviderBody<T>;
  } catch {
    return { status: "error", reason: `HTTP ${response.status}` };
  }
}

async function loadSeoGscDashboard(
  domain: string,
  signal: AbortSignal,
  onMatched: (siteUrl: string, email?: string) => void,
): Promise<SeoGscDashboardState> {
  const statusResponse = await fetch("/api/gsc/status/", { cache: "no-store", signal });
  if (!statusResponse.ok) {
    return { kind: "error", reason: `GSC 상태 API 오류 (HTTP ${statusResponse.status})` };
  }
  const status = await readProvider<{
    connected?: boolean;
    siteUrl?: string;
    email?: string;
  }>(statusResponse);
  if (status.status !== "live" || !status.data) {
    return { kind: "error", reason: status.reason ?? "GSC 연결 상태를 확인할 수 없습니다." };
  }
  if (!status.data.connected) {
    return { kind: "disconnected" };
  }

  let siteUrl = status.data.siteUrl?.trim() ?? "";
  const email = status.data.email;
  if (!siteUrl || !gscCoversDomain(siteUrl, domain)) {
    const sitesResponse = await fetch("/api/gsc/sites/", { cache: "no-store", signal });
    if (!sitesResponse.ok) {
      return { kind: "error", reason: `GSC 속성 API 오류 (HTTP ${sitesResponse.status})` };
    }
    const sites = await readProvider<{
      sites?: { siteUrl?: string; permissionLevel?: string }[];
    }>(sitesResponse);
    if (sites.status !== "live" || !Array.isArray(sites.data?.sites)) {
      return { kind: "error", reason: sites.reason ?? "GSC 속성 목록을 확인할 수 없습니다." };
    }
    const matched = pickGscSiteForDomain(sites.data.sites, domain);
    if (!matched) {
      return {
        kind: "mismatch",
        siteUrl: siteUrl || "(대표 속성 없음)",
        ...(email ? { email } : {}),
      };
    }
    siteUrl = matched;
  }

  onMatched(siteUrl, email);
  const end = new Date();
  const start = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
  const range = { start: isoDate(start), end: isoDate(end) };

  const query = async (dimension: "date" | "page", rowLimit: number) => {
    const params = new URLSearchParams({
      siteUrl,
      startDate: range.start,
      endDate: range.end,
      dimensions: dimension,
      rowLimit: String(rowLimit),
    });
    const response = await fetch(`/api/gsc/query/?${params.toString()}`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      throw new Error(`GSC 쿼리 API 오류 (HTTP ${response.status})`);
    }
    const body = await readProvider<{ rows?: SeoGscRow[] }>(response);
    if (body.status !== "live" || !Array.isArray(body.data?.rows)) {
      throw new Error(body.reason ?? "GSC 데이터를 조회하지 못했습니다.");
    }
    return body.data.rows;
  };

  try {
    const [dateRows, pageRows] = await Promise.all([query("date", 100), query("page", 250)]);
    const daily = [...dateRows]
      .sort((a, b) => (a.keys[0] ?? "").localeCompare(b.keys[0] ?? ""))
      .map((row) => ({
        date: row.keys[0] ?? "",
        clicks: row.clicks,
        impressions: row.impressions,
      }));
    const data: SeoGscLiveData = {
      siteUrl,
      ...(email ? { email } : {}),
      range,
      totals: summarizeGscRows(dateRows),
      daily,
      pages: buildTopGscPages(pageRows),
    };
    return dateRows.length === 0 && pageRows.length === 0
      ? { kind: "empty", ...data }
      : { kind: "live", ...data };
  } catch (error) {
    if (signal.aborted) throw error;
    return {
      kind: "error",
      reason: error instanceof Error ? error.message : "GSC 데이터를 조회하지 못했습니다.",
    };
  }
}

export function useSeoGscDashboard(domain: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<SeoGscDashboardState>(() => pendingSeoGscState(domain));

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setState(pendingSeoGscState(domain));
    });
    if (!domain.trim()) {
      return () => {
        cancelled = true;
      };
    }
    const controller = new AbortController();
    void loadSeoGscDashboard(domain, controller.signal, (siteUrl, email) => {
      if (!controller.signal.aborted) {
        setState({ kind: "loading", siteUrl, ...(email ? { email } : {}) });
      }
    })
      .then((next) => {
        if (!controller.signal.aborted) setState(next);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          reason: error instanceof Error ? error.message : "GSC API에 연결할 수 없습니다.",
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [domain, revision]);

  const refresh = useCallback(() => {
    setState({ kind: "checking" });
    setRevision((value) => value + 1);
  }, []);
  return { state, refresh };
}
