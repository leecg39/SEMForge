"use client";

import { useEffect, useState } from "react";
import {
  ResourceWorkspace,
  type ResourceWorkspaceProps,
} from "@/components/crud/ResourceWorkspace";
import { ToolkitPromoCarousel } from "@/components/crud/ToolkitPromoCarousel";
import { translateAppText } from "@/i18n/app";
import { useLocale } from "@/i18n/LocaleProvider";
import { api } from "@/lib/client-api";

interface MonitoredDomainTool {
  tool: "siteAudit" | "positionTracking";
  campaignId: string;
  name: string;
  status: string;
  detail: number | null;
}

interface MonitoredDomain {
  domain: string;
  folderId: string | null;
  folderName: string | null;
  tools: MonitoredDomainTool[];
}

const AUDIT_STATUS_LABEL: Record<string, string> = {
  idle: "미실행",
  queued: "대기",
  running: "실행 중",
  completed: "완료",
  failed: "실패",
};

/**
 * 모니터링할 도메인 아코디언.
 * 사이트 감사·순위 추적 캠페인이 설정된 도메인을 /api/home/monitored-domains 에서 읽어
 * 원본처럼 도구별 상태와 함께 보여준다. 아코디언을 처음 열 때만 불러온다.
 */
function MonitoredDomainsPanel() {
  const { locale } = useLocale();
  const tx = (text: string) => translateAppText(locale, text) ?? text;
  const [domains, setDomains] = useState<MonitoredDomain[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MonitoredDomain[]>("/api/home/monitored-domains/")
      .then((response) => {
        if (!cancelled) setDomains(response.data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="mt-[8px] rounded-[8px] bg-a2-card px-[20px] py-[16px] text-[14px] text-a2-text-muted shadow-[var(--a2-card-shadow)]">
        {tx("모니터링 정보를 불러오지 못했습니다.")}
      </div>
    );
  }
  if (domains === null) {
    return (
      <div className="mt-[8px] rounded-[8px] bg-a2-card px-[20px] py-[16px] text-[14px] text-a2-text-muted shadow-[var(--a2-card-shadow)]">
        {tx("불러오는 중…")}
      </div>
    );
  }
  if (domains.length === 0) {
    return (
      <div className="mt-[8px] rounded-[8px] bg-a2-card px-[20px] py-[16px] text-[14px] text-a2-text-muted shadow-[var(--a2-card-shadow)]">
        {tx("추적 중인 도메인이 없습니다. 폴더에 웹사이트를 추가하면 여기에 표시됩니다.")}
      </div>
    );
  }

  return (
    <ul className="mt-[8px] flex flex-col divide-y divide-[#eef0f2] rounded-[8px] bg-a2-card px-[20px] shadow-[var(--a2-card-shadow)]">
      {domains.map((entry) => (
        <li key={entry.domain} className="flex flex-col gap-[6px] py-[12px]">
          <div className="flex items-baseline gap-[8px]">
            <span className="text-[14px] font-semibold text-a2-text">{entry.domain}</span>
            {entry.folderName && (
              <span className="text-[12px] text-a2-text-muted">{entry.folderName}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-[8px]">
            {entry.tools.map((tool) => (
              <span
                key={tool.campaignId}
                className="inline-flex items-center gap-[6px] rounded-[4px] bg-app-bg px-2 py-[3px] text-[12px] text-app-text-secondary"
              >
                <span className="font-medium text-a2-text">
                  {tool.tool === "siteAudit" ? tx("사이트 진단") : tx("포지션 추적")}
                </span>
                {tool.tool === "siteAudit"
                  ? tx(AUDIT_STATUS_LABEL[tool.status] ?? tool.status)
                  : `${tx("가시성")} ${tool.detail ?? 0}%`}
                {tool.tool === "siteAudit" && tool.detail !== null && ` · ${tool.detail}`}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 앱 홈 (폴더) 화면.
 *
 * ko.semforge.com/home/ 의 섹션 순서를 그대로 따른다.
 *   1) 툴킷 프로모 캐러셀  2) 폴더 섹션  3) 모니터링할 도메인 아코디언  4) 피드백 전송
 * 근거: docs/research/ko.semforge.com/PAGE_TOPOLOGY.md
 */
export function FolderWorkspace(props: ResourceWorkspaceProps) {
  const { locale } = useLocale();
  const tx = (text: string) => translateAppText(locale, text) ?? text;
  const [monitoringOpen, setMonitoringOpen] = useState(false);

  return (
    <div className="flex flex-col gap-[24px]">
      <ToolkitPromoCarousel />

      <ResourceWorkspace {...props} />

      <section className="rounded-[8px]">
        <button
          type="button"
          aria-expanded={monitoringOpen}
          onClick={() => setMonitoringOpen((v) => !v)}
          className="flex h-[44px] w-full items-center justify-between rounded-[8px] bg-a2-card px-[20px] shadow-[var(--a2-card-shadow)]"
        >
          <span className="text-[16px] font-bold text-a2-text">
            <span aria-hidden="true" className="mr-2">📡</span>
            {tx("모니터링할 도메인")}
          </span>
          <span className="flex items-center gap-[6px] text-[14px] text-a2-text-muted">
            {tx(monitoringOpen ? "닫기" : "열기")}
            <span aria-hidden="true">{monitoringOpen ? "⌃" : "⌄"}</span>
          </span>
        </button>
        {monitoringOpen && <MonitoredDomainsPanel />}
      </section>

      <button
        type="button"
        className="flex w-fit items-center gap-[6px] text-[12px] text-a2-text underline underline-offset-2"
      >
        <span aria-hidden="true">💬</span>
        {tx("피드백 전송")}
      </button>
    </div>
  );
}
