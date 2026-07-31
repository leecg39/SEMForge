"use client";

import { useEffect, useState } from "react";

/**
 * Google Search Console 실측 지표를 추적 키워드에 붙이는 훅.
 *
 * /api/gsc/* 라우트는 다른 워커가 제공하며 응답 봉투가 앱 공통({ data })과
 * 다르다({ status: "live" | "unavailable" | "error", data, reason }).
 * 그래서 공용 api 래퍼 대신 fetch 를 직접 쓰고 status 필드를 그대로 해석한다.
 * GSC 수치는 TalorData 수집 순위와 별개 출처임을 UI 에 명시한다.
 */

export interface GscKeywordMetric {
  clicks: number;
  impressions: number;
  /** 0~1 비율. 표시 시 % 로 변환한다. */
  ctr: number;
  /** 평균 게재순위 (GSC 실측, TalorData 수집 순위와 다름) */
  position: number;
}

export type GscKeywordMetricsState =
  | { kind: "disconnected" }
  | { kind: "domain-mismatch"; siteUrl: string; email?: string }
  | { kind: "unavailable"; reason: string }
  | {
      kind: "ready";
      siteUrl: string;
      email?: string;
      startDate: string;
      endDate: string;
      /** 정규화한 쿼리 문자열 → 실측 지표 */
      rows: Map<string, GscKeywordMetric>;
    };

/** collect.ts 의 키워드 정규화와 같은 규칙 (공백 정리 + 소문자). */
export function normalizeGscKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

/** GSC siteUrl(sc-domain:example.com 또는 https://example.com/…)에서 도메인을 뽑는다. */
export function domainFromGscSiteUrl(siteUrl: string): string {
  const trimmed = siteUrl.trim().toLowerCase();
  if (trimmed.startsWith("sc-domain:")) {
    return trimmed
      .slice("sc-domain:".length)
      .replace(/^www\./, "")
      .replace(/\.$/, "");
  }
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

function normalizeCampaignDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

/** GSC 속성이 캠페인 도메인을 커버하는지 판정 (도메인 속성은 서브도메인 포함). */
export function gscCoversDomain(siteUrl: string, campaignDomain: string): boolean {
  const gscDomain = domainFromGscSiteUrl(siteUrl);
  const target = normalizeCampaignDomain(campaignDomain);
  if (!gscDomain || !target) return false;
  return target === gscDomain || target.endsWith(`.${gscDomain}`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface GscStatusBody {
  status?: string;
  data?: { connected?: boolean; siteUrl?: string; email?: string };
  reason?: string;
}

interface GscQueryBody {
  status?: string;
  data?: {
    rows?: {
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }[];
  };
  reason?: string;
}

interface GscSitesBody {
  status?: string;
  data?: { sites?: { siteUrl?: string; permissionLevel?: string }[] };
  reason?: string;
}

/**
 * 계정 속성 목록에서 캠페인 도메인을 커버하는 속성을 고른다.
 * 도메인 속성(sc-domain:)과 정확히 일치하는 도메인을 우선한다.
 * 미검증(siteUnverifiedUser) 속성은 조회 권한이 없어 제외한다.
 */
export function pickGscSiteForDomain(
  sites: { siteUrl?: string; permissionLevel?: string }[],
  campaignDomain: string
): string | null {
  const target = normalizeCampaignDomain(campaignDomain);
  if (!target) return null;
  let best: { siteUrl: string; score: number } | null = null;
  for (const site of sites) {
    const siteUrl = site.siteUrl?.trim();
    if (!siteUrl) continue;
    if (site.permissionLevel === "siteUnverifiedUser") continue;
    if (!gscCoversDomain(siteUrl, campaignDomain)) continue;
    const isDomainProperty = siteUrl.toLowerCase().startsWith("sc-domain:");
    const isExactDomain = domainFromGscSiteUrl(siteUrl) === target;
    const score = (isDomainProperty ? 2 : 0) + (isExactDomain ? 1 : 0);
    if (!best || score > best.score) best = { siteUrl, score };
  }
  return best?.siteUrl ?? null;
}

/** 연결 계정의 속성 목록에서 캠페인 도메인용 속성을 찾는다. 목록 조회 실패는 사유와 함께 구분한다. */
async function findAccountSiteForDomain(
  campaignDomain: string
): Promise<{ ok: true; siteUrl: string | null } | { ok: false; reason: string }> {
  const response = await fetch("/api/gsc/sites/", { cache: "no-store" });
  if (!response.ok) {
    return { ok: false, reason: `GSC 속성 목록 API 오류 (HTTP ${response.status})` };
  }
  const body = (await response.json()) as GscSitesBody;
  if (body.status !== "live" || !Array.isArray(body.data?.sites)) {
    return { ok: false, reason: body.reason ?? "GSC 속성 목록을 확인할 수 없습니다." };
  }
  return { ok: true, siteUrl: pickGscSiteForDomain(body.data.sites, campaignDomain) };
}

async function loadGscState(campaignDomain: string): Promise<GscKeywordMetricsState> {
  const statusResponse = await fetch("/api/gsc/status/", { cache: "no-store" });
  if (!statusResponse.ok) {
    return { kind: "unavailable", reason: `GSC 상태 API 오류 (HTTP ${statusResponse.status})` };
  }
  const statusBody = (await statusResponse.json()) as GscStatusBody;
  if (statusBody.status !== "live" || !statusBody.data) {
    return { kind: "unavailable", reason: statusBody.reason ?? "GSC 상태를 확인할 수 없습니다." };
  }
  if (!statusBody.data.connected) {
    return { kind: "disconnected" };
  }

  let siteUrl = statusBody.data.siteUrl ?? "";
  const email = statusBody.data.email;
  if (!siteUrl || !gscCoversDomain(siteUrl, campaignDomain)) {
    // 대표 속성이 캠페인 도메인을 커버하지 않아도 같은 계정에 해당 도메인
    // 속성이 있을 수 있다. 전체 속성 목록에서 찾고, 정말 없을 때만 불일치로 안내한다.
    const lookup = await findAccountSiteForDomain(campaignDomain);
    if (!lookup.ok) {
      return { kind: "unavailable", reason: lookup.reason };
    }
    if (!lookup.siteUrl) {
      return {
        kind: "domain-mismatch",
        siteUrl: siteUrl || "(알 수 없음)",
        ...(email ? { email } : {}),
      };
    }
    siteUrl = lookup.siteUrl;
  }

  // 최근 28일 (GSC 수치는 며칠 지연되어 확정되지만 범위는 오늘까지로 둔다)
  const end = new Date();
  const start = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    siteUrl,
    startDate: formatDate(start),
    endDate: formatDate(end),
    dimensions: "query",
    rowLimit: "500",
  });
  const queryResponse = await fetch(`/api/gsc/query/?${params.toString()}`, { cache: "no-store" });
  if (!queryResponse.ok) {
    return { kind: "unavailable", reason: `GSC 쿼리 API 오류 (HTTP ${queryResponse.status})` };
  }
  const queryBody = (await queryResponse.json()) as GscQueryBody;
  if (queryBody.status !== "live" || !queryBody.data?.rows) {
    return {
      kind: "unavailable",
      reason: queryBody.reason ?? "GSC 데이터를 사용할 수 없습니다.",
    };
  }

  const rows = new Map<string, GscKeywordMetric>();
  for (const row of queryBody.data.rows) {
    const query = row.keys?.[0];
    if (!query) continue;
    const key = normalizeGscKeyword(query);
    if (!rows.has(key)) {
      rows.set(key, {
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      });
    }
  }

  return {
    kind: "ready",
    siteUrl,
    ...(email ? { email } : {}),
    startDate: formatDate(start),
    endDate: formatDate(end),
    rows,
  };
}

export function useGscKeywordMetrics(campaignDomain: string | null): {
  loading: boolean;
  state: GscKeywordMetricsState | null;
} {
  const [result, setResult] = useState<{ domain: string; state: GscKeywordMetricsState } | null>(
    null
  );
  // 로딩 상태는 "요청한 도메인 != 마지막 반영 도메인"으로 파생한다 (effect 내 동기 setState 방지).
  const loading = campaignDomain !== null && result?.domain !== campaignDomain;

  useEffect(() => {
    if (!campaignDomain) return;
    let cancelled = false;
    void (async () => {
      try {
        const state = await loadGscState(campaignDomain);
        if (!cancelled) setResult({ domain: campaignDomain, state });
      } catch {
        if (!cancelled) {
          setResult({
            domain: campaignDomain,
            state: { kind: "unavailable", reason: "GSC API에 연결할 수 없습니다." },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignDomain]);

  return {
    loading,
    state:
      campaignDomain && result?.domain === campaignDomain ? result.state : null,
  };
}
