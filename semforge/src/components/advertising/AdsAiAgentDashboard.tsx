"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, Cross2Icon, MagicWandIcon, ReloadIcon } from "@radix-ui/react-icons";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/LocaleProvider";
import type {
  AdCampaignDraft,
  AdRecommendation,
  AdvertisingCapabilities,
} from "@/server/advertising/contracts";

const kindLabels: Record<AdRecommendation["kind"], string> = {
  add_keyword: "키워드 추가",
  remove_keyword: "제외·삭제 키워드",
  restructure_ad_group: "광고 그룹 재구성",
  rewrite_copy: "광고 문구 수정",
  landing_page: "랜딩페이지 메시지",
  budget: "예산 배분 참고안",
};

const statusLabels: Record<AdRecommendation["status"], string> = {
  pending: "검토 대기",
  applied: "적용됨",
  rejected: "거절됨",
};

const kindLabelsEn: Record<AdRecommendation["kind"], string> = {
  add_keyword: "Add keyword",
  remove_keyword: "Exclude or remove keyword",
  restructure_ad_group: "Restructure ad group",
  rewrite_copy: "Rewrite ad copy",
  landing_page: "Landing page message",
  budget: "Advisory budget allocation",
};

const statusLabelsEn: Record<AdRecommendation["status"], string> = {
  pending: "Pending review",
  applied: "Applied",
  rejected: "Rejected",
};

function errorMessage(error: unknown): string {
  if (error instanceof ClientApiError) return error.message;
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function valuePreview(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "제안 값을 표시할 수 없습니다.";
  }
}

export function AdsAiAgentDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const folderId = searchParams.get("fid");
  const [campaigns, setCampaigns] = useState<AdCampaignDraft[]>([]);
  const [selectedId, setSelectedId] = useState(searchParams.get("campaign") ?? "");
  const [campaign, setCampaign] = useState<AdCampaignDraft | null>(null);
  const [capabilities, setCapabilities] = useState<AdvertisingCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [resolvingId, setResolvingId] = useState("");
  const [applyingAll, setApplyingAll] = useState(false);
  const [filter, setFilter] = useState<"all" | AdRecommendation["status"]>("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const preferredId = searchParams.get("campaign") ?? "";
    Promise.all([
      api.get<AdCampaignDraft[]>("/api/advertising/campaigns/"),
      api.get<AdvertisingCapabilities>("/api/advertising/capabilities/"),
    ])
      .then(([{ data: list }, { data: caps }]) => {
        if (cancelled) return;
        setCampaigns(list);
        setCapabilities(caps);
        const id = preferredId || list[0]?.id || "";
        setSelectedId(id);
        setCampaign(list.find((item) => item.id === id) ?? null);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [searchParams]);

  const selectCampaign = (id: string) => {
    setSelectedId(id);
    setCampaign(campaigns.find((item) => item.id === id) ?? null);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("campaign", id);
    else params.delete("campaign");
    router.replace(`/advertising/ads-ai-agent/?${params.toString()}`);
  };

  const generate = async () => {
    if (!campaign) return;
    setGenerating(true);
    setError(null);
    try {
      const { data } = await api.post<AdCampaignDraft>(
        `/api/advertising/campaigns/${campaign.id}/generate/`,
      );
      setCampaign(data);
      setCampaigns((current) => current.map((item) => item.id === data.id ? data : item));
      setFilter("pending");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setGenerating(false);
    }
  };

  const resolve = async (recommendationId: string, action: "apply" | "reject") => {
    if (!campaign) return;
    setResolvingId(recommendationId);
    setError(null);
    try {
      const { data } = await api.patch<AdCampaignDraft>(
        `/api/advertising/campaigns/${campaign.id}/recommendations/${recommendationId}/`,
        { action },
      );
      setCampaign(data);
      setCampaigns((current) => current.map((item) => item.id === data.id ? data : item));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setResolvingId("");
    }
  };

  const applyAll = async () => {
    if (!campaign || !pendingCount) return;
    setApplyingAll(true);
    setError(null);
    try {
      const { data } = await api.post<AdCampaignDraft>(
        `/api/advertising/campaigns/${campaign.id}/recommendations/apply-all/`,
      );
      setCampaign(data);
      setCampaigns((current) => current.map((item) => item.id === data.id ? data : item));
      setFilter("applied");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setApplyingAll(false);
    }
  };

  const recommendations = useMemo(() => {
    const values = campaign?.recommendations ?? [];
    return filter === "all" ? values : values.filter((item) => item.status === filter);
  }, [campaign, filter]);
  const pendingCount = campaign?.recommendations.filter((item) => item.status === "pending").length ?? 0;

  return (
    <div className="min-h-full bg-[#f5f6f7] p-4 text-app-text md:p-6">
      <div className="mx-auto max-w-[1280px]">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] text-app-text-secondary">{ko ? "광고 툴킷 · 승인형 워크플로" : "Advertising Toolkit · Approval workflow"}</p>
            <h1 className="mt-1 flex items-center gap-2 text-[24px] font-semibold"><MagicWandIcon className="text-[#8a4dcc]" /> {ko ? "광고 AI 에이전트" : "Ads AI Agent"}</h1>
            <p className="mt-1 text-[13px] text-app-text-secondary">{ko ? "AI는 제안만 생성합니다. 승인하기 전에는 캠페인을 변경하지 않습니다." : "AI creates suggestions only. Nothing changes until you approve it."}</p>
          </div>
          <Link href={`/advertising/ads-launch-assistant/${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`} className="inline-flex h-9 items-center rounded-[7px] bg-[#151a18] px-4 text-[12px] font-semibold text-white">{ko ? "새 캠페인 초안" : "New campaign draft"}</Link>
        </header>

        {error && <div role="alert" className="mt-4 flex justify-between gap-3 rounded-[8px] border border-[#f2b8b5] bg-[#fff4f3] px-4 py-3 text-[13px] text-app-red"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="오류 닫기"><Cross2Icon /></button></div>}

        {capabilities && !capabilities.aiCopy.enabled && (
          <div className="mt-4 rounded-[8px] border border-[#e6d29d] bg-[#fff9e8] px-4 py-3 text-[12px] text-[#725400]">
            {ko ? "AI 문구 생성 비활성:" : "AI copy is disabled:"} {capabilities.aiCopy.reason} {ko ? "수동 편집·광고 리서치·내보내기는 계속 사용할 수 있습니다." : "Manual editing, research, and export remain available."}
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[10px] border border-app-border bg-white p-4 lg:sticky lg:top-4">
            <label className="text-[12px] font-semibold">{ko ? "검토할 캠페인" : "Campaign to review"}</label>
            <select value={selectedId} disabled={generating || applyingAll || Boolean(resolvingId)} onChange={(event) => selectCampaign(event.target.value)} className="mt-2 h-10 w-full rounded-[7px] border border-app-border bg-white px-3 text-[12px] outline-none focus:border-app-blue disabled:cursor-not-allowed disabled:opacity-60">
              {!campaigns.length && <option value="">{ko ? "저장된 캠페인 없음" : "No saved campaigns"}</option>}
              {campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {campaign && <dl className="mt-4 space-y-3 border-t border-app-border pt-4 text-[12px]"><div><dt className="text-app-text-secondary">{ko ? "도메인" : "Domain"}</dt><dd className="mt-0.5 font-medium">{campaign.domain}</dd></div><div><dt className="text-app-text-secondary">{ko ? "플랫폼" : "Platform"}</dt><dd className="mt-0.5 font-medium">{campaign.platform === "google" ? (ko ? "Google 검색" : "Google Search") : "Meta"}</dd></div><div><dt className="text-app-text-secondary">{ko ? "상태" : "Status"}</dt><dd className="mt-0.5 font-medium">{campaign.status}</dd></div><div><dt className="text-app-text-secondary">{ko ? "대기 중 제안" : "Pending suggestions"}</dt><dd className="mt-0.5 font-medium text-[#7a3cb5]">{pendingCount}{ko ? "개" : ""}</dd></div></dl>}
            {campaign && <Link href={`/advertising/ads-launch-assistant/?campaign=${campaign.id}${folderId ? `&fid=${encodeURIComponent(folderId)}` : ""}`} className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-[7px] border border-app-border text-[12px] font-semibold">{ko ? "초안 직접 편집" : "Edit draft manually"}</Link>}
          </aside>

          <main className="min-w-0">
            {loading ? (
              <div className="flex min-h-[360px] items-center justify-center rounded-[10px] border border-app-border bg-white text-[13px] text-app-text-secondary"><ReloadIcon className="mr-2 animate-spin" /> {ko ? "캠페인을 불러오는 중…" : "Loading campaigns…"}</div>
            ) : !campaign ? (
              <div className="rounded-[10px] border border-dashed border-app-border bg-white px-6 py-16 text-center"><h2 className="text-[16px] font-semibold">{ko ? "검토할 캠페인 초안이 없습니다" : "There is no campaign draft to review"}</h2><p className="mt-2 text-[12px] text-app-text-secondary">{ko ? "광고 시작 도우미에서 먼저 저장형 초안을 만드세요." : "Create a saved draft in Ads Launch Assistant first."}</p><Link href="/advertising/ads-launch-assistant/" className="mt-5 inline-flex h-9 items-center rounded-[7px] bg-app-blue px-4 text-[12px] font-semibold text-white">{ko ? "초안 만들기" : "Create draft"}</Link></div>
            ) : (
              <>
                <div className="rounded-[10px] border border-app-border bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-[16px] font-semibold">{ko ? "근거 기반 제안 생성" : "Generate evidence-based suggestions"}</h2><p className="mt-1 max-w-[680px] text-[12px] leading-5 text-app-text-secondary">{ko ? "웹사이트 문맥, 현재 키워드, 광고 설정을 사용합니다. 계정 미연결 상태에서는 전환율·절감액·ROI 개선 수치를 만들지 않습니다." : "Uses website context, current keywords, and campaign settings. It does not invent conversion, savings, or ROI improvements without account data."}</p></div><button type="button" disabled={generating || applyingAll || Boolean(resolvingId) || !capabilities?.aiCopy.enabled} onClick={() => void generate()} className="inline-flex h-10 items-center gap-2 rounded-[7px] bg-[#8a4dcc] px-5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{generating ? <><ReloadIcon className="animate-spin" /> {ko ? "생성 중…" : "Generating…"}</> : <><MagicWandIcon /> {ko ? "새 제안 생성" : "Generate suggestions"}</>}</button></div>
                  <p className="mt-3 text-[11px] text-app-text-secondary">{ko ? "예산 제안은 항상 추정·참고안입니다. 실제 광고 게재나 계정 변경은 수행하지 않습니다." : "Budget suggestions are always advisory estimates. No ads are served and no account is changed."}</p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2" role="tablist" aria-label={ko ? "제안 상태 필터" : "Suggestion status filter"}>
                    {(["pending", "applied", "rejected", "all"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={cn("h-8 rounded-full border px-3 text-[11px] font-semibold", filter === value ? "border-[#8a4dcc] bg-[#f6edff] text-[#6f35a7]" : "border-app-border bg-white text-app-text-secondary")}>{value === "all" ? (ko ? "전체" : "All") : (ko ? statusLabels[value] : statusLabelsEn[value])} {value === "pending" ? `(${pendingCount})` : ""}</button>)}
                  </div>
                  <button type="button" disabled={!pendingCount || generating || applyingAll || Boolean(resolvingId)} onClick={() => void applyAll()} className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-app-green px-4 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {applyingAll ? <ReloadIcon className="animate-spin" /> : <CheckIcon />}
                    {applyingAll ? (ko ? "전체 적용 중…" : "Applying all…") : (ko ? `전체 적용 (${pendingCount})` : `Apply all (${pendingCount})`)}
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {!recommendations.length && <div className="rounded-[10px] border border-dashed border-app-border bg-white px-5 py-14 text-center text-[12px] text-app-text-secondary">{ko ? "이 상태의 제안이 없습니다. 새 제안을 생성해 검토를 시작하세요." : "There are no suggestions in this state. Generate suggestions to start reviewing."}</div>}
                  {recommendations.map((recommendation) => (
                    <article key={recommendation.id} className="overflow-hidden rounded-[10px] border border-app-border bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-4 py-3"><div className="flex items-center gap-2"><span className="rounded-full bg-[#f3e9ff] px-2.5 py-1 text-[11px] font-semibold text-[#7135a9]">{ko ? kindLabels[recommendation.kind] : kindLabelsEn[recommendation.kind]}</span><span className={cn("text-[11px]", recommendation.status === "applied" ? "text-app-green" : recommendation.status === "rejected" ? "text-app-red" : "text-app-text-secondary")}>{ko ? statusLabels[recommendation.status] : statusLabelsEn[recommendation.status]}</span></div><span className="text-[10px] text-app-text-secondary">{recommendation.source}</span></div>
                      <div className="p-4"><p className="text-[13px] leading-5">{recommendation.rationale}</p><div className="mt-3 grid gap-3 md:grid-cols-2"><div className="min-w-0 rounded-[7px] bg-[#f7f8f9] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-app-text-secondary">{ko ? "적용 전" : "Before"}</p><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-5">{valuePreview(recommendation.beforeValue)}</pre></div><div className="min-w-0 rounded-[7px] bg-[#f8f4fc] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#7135a9]">{ko ? "제안 값" : "Suggested value"}</p><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-5">{valuePreview(recommendation.afterValue)}</pre></div></div>
                        {recommendation.status === "pending" && <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={generating || applyingAll || Boolean(resolvingId)} onClick={() => void resolve(recommendation.id, "reject")} className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-app-border px-4 text-[11px] font-semibold disabled:opacity-50"><Cross2Icon /> {ko ? "거절" : "Reject"}</button><button type="button" disabled={generating || applyingAll || Boolean(resolvingId)} onClick={() => void resolve(recommendation.id, "apply")} className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-app-green px-4 text-[11px] font-semibold text-white disabled:opacity-50">{resolvingId === recommendation.id ? <ReloadIcon className="animate-spin" /> : <CheckIcon />} {ko ? "적용" : "Apply"}</button></div>}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
