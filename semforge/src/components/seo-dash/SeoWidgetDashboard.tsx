"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { SeoDashHeader, type SeoDashProject } from "@/components/seo-dash/SeoDashHeader";
import { WidgetAiSearch, type AiVisibilityWidgetSummary } from "@/components/seo-dash/WidgetAiSearch";
import { WidgetSeoMetrics } from "@/components/seo-dash/WidgetSeoMetrics";
import {
  WidgetSecondary,
  SECONDARY_WIDGETS_EN,
  SECONDARY_WIDGETS_KO,
} from "@/components/seo-dash/WidgetSecondary";
import { WidgetTrafficAnalytics } from "@/components/seo-dash/WidgetTrafficAnalytics";
import { WidgetOnPageSeo, type OnPageSeoWidgetSummary } from "@/components/seo-dash/WidgetOnPageSeo";
import { WidgetOrganicRank } from "@/components/seo-dash/WidgetOrganicRank";
import { WidgetBacklinks, type RefDomainMonth } from "@/components/seo-dash/WidgetBacklinks";
import {
  WidgetSiteAudit,
  type SiteAuditWidgetSummary,
} from "@/components/seo-dash/WidgetSiteAudit";
import {
  WidgetPositionTracking,
  type PositionTrackingActiveRunSummary,
  type PositionTrackingWidgetSummary,
} from "@/components/seo-dash/WidgetPositionTracking";
import { WidgetGoogleConnect, WidgetHiddenWidgets } from "@/components/seo-dash/WidgetStubs";
import { cn } from "@/lib/utils";

type DomainCollectState = "collecting" | "refreshing" | "empty" | "stale" | "error";

function SeoDomainDataLoader({
  domain,
  countryCode,
}: {
  domain: string;
  countryCode: string;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [state, setState] = useState<DomainCollectState>("collecting");
  const [message, setMessage] = useState<string | null>(null);
  const [refreshPending, startRefresh] = useTransition();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/analytics/domain-overview/collect/", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ domain, countryCode, device: "desktop" }),
        });
        const body = (await response.json()) as {
          data?: { collected?: number; ranked?: number; outcomes?: { error?: string }[] };
          error?: { message?: string };
        };
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message || `HTTP ${response.status}`);
        }
        // 도메인 개요 리포트는 이 도메인이 SERP 순위권에 있어야만 만들어진다.
        // collected(수집 성공 키워드 수)만 보고 refresh 를 기다리면, 수집은 됐지만
        // 순위가 없는 도메인에서 "업데이트 중" 스피너가 영영 끝나지 않는다 —
        // 반드시 ranked(도메인이 확인된 키워드 수)로 판단한다.
        if ((body.data.ranked ?? 0) > 0) {
          setState("refreshing");
          startRefresh(() => router.refresh());
          return;
        }
        if ((body.data.collected ?? 0) > 0) {
          setState("empty");
          return;
        }
        // 200 응답이어도 모든 키워드 수집이 실패한 경우 (사용량 한도 등):
        // 빈 상태가 아니라 실패 사유를 정직하게 표시한다.
        setMessage(body.data.outcomes?.find((outcome) => outcome.error)?.error ?? null);
        setState("error");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setMessage(caught instanceof Error ? caught.message : null);
        setState("error");
      }
    })();
    return () => controller.abort();
  }, [countryCode, domain, router]);

  // router.refresh() 가 끝났는데도 이 컴포넌트가 아직 마운트돼 있다면 서버가
  // 리포트를 반영하지 못한 것이다. "refreshing" 은 순위가 확인된(ranked>0)
  // 경우에만 진입하므로(순위 없음은 곧장 "empty"), 이 강등은 "순위 없음"이
  // 아니라 반영 지연(stale)으로 안내해야 한다.
  const resolvedState: DomainCollectState =
    state === "refreshing" && !refreshPending ? "stale" : state;

  // 수집 자체는 성공했지만 이 도메인이 시드 키워드의 검색 결과에 없었던 경우다.
  // 각 위젯이 이미 실데이터 없음 상태를 표시하므로, 완료된 정상 상태를 경고처럼
  // 대시보드 상단에 계속 남기지 않는다.
  if (resolvedState === "empty") return null;

  const label =
    resolvedState === "collecting"
      ? ko
        ? `${domain}의 실제 검색 데이터를 수집하고 있습니다…`
        : `Collecting live search data for ${domain}…`
      : resolvedState === "refreshing"
        ? ko
          ? "수집한 데이터로 위젯을 업데이트하고 있습니다…"
          : "Updating widgets with the collected data…"
        : resolvedState === "stale"
          ? ko
            ? "순위를 수집했습니다. 반영이 지연되고 있으니 잠시 후 새로고침 해 주세요."
            : "Rankings were collected. Updating is delayed — please refresh in a moment."
          : message || (ko ? "사이트 데이터를 가져오지 못했습니다." : "Could not load site data.");

  return (
    <div
      role={resolvedState === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "xl:col-span-4 flex min-h-11 items-center gap-3 rounded-[8px] border px-4 py-2.5 text-[13px]",
        resolvedState === "error"
          ? "border-[#ffc8d4] bg-[#fff4f6] text-[#a80028]"
          : "border-[#b9d8f2] bg-[#f2f8fd] text-[#235c85]",
      )}
    >
      {(resolvedState === "collecting" || resolvedState === "refreshing") && (
        <ReloadIcon className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      )}
      {label}
    </div>
  );
}

/**
 * ko.semforge.com/seo/30605634/ 위젯 대시보드 조립.
 * 4열 그리드(322.25px ×4, gap 24px), 레퍼런스 배열:
 *   1행 AI 검색(2) | SEO(2)
 *   2행 포지션 추적(3) | 사이트 진단(1)
 *   3행 온페이지(1, 세로 2행) | 백링크 감사(1) | 자연 트래픽 인사이트(2)
 *   4행 (온페이지 계속) | Traffic Analytics(3)
 *   5행 자연검색 순위(2) | 백링크(2)
 * 근거: docs/research/ko.semforge.com/seo-dashboard/PAGE_TOPOLOGY.md + 첨부 레퍼런스
 */
export function SeoWidgetDashboard({
  report,
  projects,
  currentDomain,
  countryCode,
  monthlyRefDomains,
  dateLabel,
  siteAuditSummary,
  positionTrackingSummary,
  positionTrackingActiveRun,
  positionTrackingDomain,
  currentFolderId,
  aiVisibilitySummary,
  onpageSummary,
}: {
  report: DomainAnalyticsReport | null;
  projects: SeoDashProject[];
  currentDomain: string;
  countryCode: string;
  monthlyRefDomains: RefDomainMonth[];
  dateLabel: string;
  siteAuditSummary: SiteAuditWidgetSummary | null;
  positionTrackingSummary: PositionTrackingWidgetSummary | null;
  positionTrackingActiveRun?: PositionTrackingActiveRunSummary | null;
  positionTrackingDomain?: string;
  currentFolderId?: string | null;
  aiVisibilitySummary?: AiVisibilityWidgetSummary | null;
  onpageSummary?: OnPageSeoWidgetSummary | null;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [selectedDomain, setSelectedDomain] = useState(currentDomain);
  const [navigationPending, setNavigationPending] = useState(false);
  const projectName =
    projects.find((project) => project.domain === selectedDomain)?.name ?? selectedDomain;

  const selectProject = (domain: string) => {
    if (domain === currentDomain) return;
    setSelectedDomain(domain);
    setNavigationPending(true);
    router.push(`/seo/?domain=${encodeURIComponent(domain)}`);
  };

  const secondaryWidgets = ko ? SECONDARY_WIDGETS_KO : SECONDARY_WIDGETS_EN;
  const secondaryByKey = new Map(secondaryWidgets.map((widget) => [widget.key, widget]));
  const siteAuditStub = secondaryByKey.get("siteAudit");
  const backlinkAuditStub = secondaryByKey.get("backlinkAudit");
  const organicTrafficStub = secondaryByKey.get("organicTrafficInsights");

  return (
    <div className="min-w-0">
      <SeoDashHeader
        projectName={projectName}
        projects={projects}
        currentDomain={selectedDomain}
        onSelectProject={selectProject}
        loading={navigationPending}
      />

      <hr className="border-0 bg-app-border" style={{ height: 1 }} aria-hidden="true" />

      <div
        aria-busy={navigationPending}
        className="grid grid-cols-1 gap-6 px-[18px] pb-[76px] pl-8 pt-4 md:grid-cols-2 xl:grid-cols-4"
        style={{ maxWidth: "max(100% - 14px, 1030px)" }}
      >
        {!report && currentDomain && (
          <SeoDomainDataLoader domain={currentDomain} countryCode={countryCode} />
        )}
        <WidgetAiSearch summary={aiVisibilitySummary} domain={currentDomain} folderId={currentFolderId} />
        <WidgetSeoMetrics
          report={report}
          dateLabel={dateLabel}
          countryCode={countryCode}
          monthly={monthlyRefDomains}
        />
        {/* 2행: 포지션 추적(3) | 사이트 진단(1) */}
        <WidgetPositionTracking
          summary={positionTrackingSummary}
          domain={positionTrackingDomain ?? currentDomain}
          folderId={currentFolderId}
          activeRun={positionTrackingActiveRun}
        />
        {siteAuditSummary ? (
          <WidgetSiteAudit summary={siteAuditSummary} />
        ) : (
          siteAuditStub && (
            <WidgetSecondary
              title={siteAuditStub.title}
              description={siteAuditStub.description}
              href={siteAuditStub.href}
            />
          )
        )}

        {/* 3행: 온페이지(1, 세로 2행) | 백링크 감사(1) | 자연 트래픽 인사이트(2) */}
        <WidgetOnPageSeo summary={onpageSummary ?? null} className="xl:row-span-2" />
        {backlinkAuditStub && (
          <WidgetSecondary
            title={backlinkAuditStub.title}
            description={backlinkAuditStub.description}
            href={backlinkAuditStub.href}
          />
        )}
        {organicTrafficStub && (
          <WidgetSecondary
            title={organicTrafficStub.title}
            description={organicTrafficStub.description}
            href={organicTrafficStub.href}
            className="xl:col-span-2"
          />
        )}

        {/* 4행: (온페이지 계속) | Traffic Analytics(3) */}
        <WidgetTrafficAnalytics report={report} />
        <WidgetOrganicRank report={report} countryCode={countryCode} />
        <WidgetBacklinks report={report} monthly={monthlyRefDomains} />
        <WidgetGoogleConnect />
        <WidgetHiddenWidgets />
        <div className="xl:col-span-4">
          <button
            type="button"
            className="text-[12px] text-a2-text-muted underline underline-offset-2 hover:text-a2-text"
          >
            {ko ? "위젯 제안" : "Suggest a widget"}
          </button>
        </div>
      </div>
    </div>
  );
}
