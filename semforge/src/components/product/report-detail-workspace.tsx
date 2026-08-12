"use client";

// @TASK P4-F1-T1 - Korean immutable report snapshot web renderer
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import { useState, type CSSProperties } from "react";

import { StatusPanel } from "@/components/core-shell/status-panel";

import { useApiResource } from "./api-client";
import { useBillingAccess } from "./billing-access";
import {
  parseReportDetail,
  type ReportDetailViewModel,
  type ReportSectionView,
} from "./contracts";
import {
  formatCalendarDateKo,
  formatDateTimeKo,
  formatNumberKo,
  formatPeriodKo,
} from "./format";
import { ResourcePanel } from "./resource-panel";

export interface ReportPdfDownloadViewModel {
  readonly url: string;
  readonly expiresAt: string;
}

export interface ReportPdfPopup {
  opener: unknown;
  readonly location: { replace(url: string): void };
  close(): void;
}

export type ReportPdfPopupOpener = (url: string, target: string) => ReportPdfPopup | null;

export function parseReportPdfDownload(value: unknown): ReportPdfDownloadViewModel | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.url !== "string" || typeof source.expiresAt !== "string") return null;
  if (!Number.isFinite(Date.parse(source.expiresAt))) return null;
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url: source.url, expiresAt: source.expiresAt };
}

export function reserveReportPdfPopup(opener?: ReportPdfPopupOpener): ReportPdfPopup {
  const openPopup: ReportPdfPopupOpener = opener ?? ((url, target) => {
    if (typeof window === "undefined") return null;
    return window.open(url, target);
  });
  const popup = openPopup("about:blank", "_blank");
  if (!popup) {
    throw new Error("새 창을 열지 못했습니다. 팝업 허용 후 다시 시도해 주세요.");
  }
  popup.opener = null;
  return popup;
}

export async function openReportPdf(
  reportId: string,
  popup: ReportPdfPopup,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  try {
    const response = await fetcher(`/api/v1/reports/${encodeURIComponent(reportId)}/pdf`, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    const envelope = typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
    const pdf = parseReportPdfDownload(envelope?.data);
    if (!response.ok || !pdf) {
      const message = response.status === 404
        ? "PDF 파일을 준비하고 있습니다. 잠시 후 다시 시도해 주세요."
        : "PDF 다운로드 URL을 불러오지 못했습니다.";
      throw new Error(message);
    }
    popup.location.replace(pdf.url);
  } catch (error) {
    popup.close();
    throw error;
  }
}

export function ReportPdfDownload({
  reportId,
  blockedByPastDue,
}: {
  reportId: string;
  blockedByPastDue: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function open() {
    if (blockedByPastDue || state === "loading") return;
    setState("loading");
    setMessage("");
    try {
      const popup = reserveReportPdfPopup();
      await openReportPdf(reportId, popup);
      setState("idle");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "PDF 다운로드 URL을 불러오지 못했습니다.");
    }
  }

  return (
    <div className="sf-report-actions" data-endpoint={`/api/v1/reports/${reportId}/pdf`}>
      <button
        className="sf-button sf-button--secondary"
        style={{ minHeight: 44 }}
        type="button"
        disabled={blockedByPastDue || state === "loading"}
        aria-busy={state === "loading"}
        onClick={() => void open()}
      >
        {state === "loading" ? "PDF 준비 확인 중…" : "PDF 열기"}
      </button>
      {blockedByPastDue ? <p role="status">PDF는 과거 리포트에서만 열 수 있습니다.</p> : null}
      {state === "error" ? <p role="alert">{message}</p> : null}
    </div>
  );
}

function records(value: unknown): ReadonlyArray<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeHttpUrl(value: unknown) {
  const candidate = stringValue(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const unavailableReasonCopy: Readonly<Record<string, string>> = {
  provider_data_missing: "공급자 데이터가 확인되지 않았습니다.",
  collection_failed: "수집 요청이 완료되지 않았습니다.",
  connection_missing: "데이터 연결이 설정되지 않았습니다.",
};

function SectionFrame({
  section,
  title,
  description,
  children,
}: {
  section: ReportSectionView;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="sf-snapshot-section" aria-labelledby={`report-section-${section.key}`}>
      <div className="sf-snapshot-section__heading">
        <div>
          <p className="sf-eyebrow">{description}</p>
          <h2 id={`report-section-${section.key}`}>{title}</h2>
        </div>
        <div className="sf-snapshot-section__stamp">
          <span className={`sf-state-chip ${section.available ? "sf-state-chip--success" : "sf-state-chip--warning"}`}>
            {section.available ? "확인됨" : "확인 불가"}
          </span>
          <small>{formatDateTimeKo(section.capturedAt)} 기준</small>
        </div>
      </div>
      {section.available ? children : (
        <StatusPanel
          status="partial"
          title={`${title} 데이터가 없습니다`}
          description={section.unavailableReason ? unavailableReasonCopy[section.unavailableReason] ?? `수집 사유: ${section.unavailableReason}` : "수집 상태를 확인할 수 없습니다."}
        />
      )}
    </section>
  );
}

function RankSection({ section }: { section: ReportSectionView }) {
  const observations = records(section.data.observations);
  return (
    <SectionFrame section={section} title="Google 순위" description="한국 · 한국어 · 데스크톱 · Top 100">
      {observations.length === 0 ? <p className="sf-empty-inline">확인된 순위 관측값이 없습니다.</p> : (
        <div className="sf-table-scroll" tabIndex={0} role="region" aria-label="Google 순위 관측 표">
          <table className="sf-data-table">
            <thead><tr><th scope="col">검색어</th><th scope="col">순위</th><th scope="col">노출 결과</th><th scope="col">관측 시각</th></tr></thead>
            <tbody>
              {observations.map((row, index) => {
                const query = stringValue(row.query) ?? "검색어 확인 불가";
                const position = numberValue(row.position);
                const url = safeHttpUrl(row.resultUrl);
                const title = stringValue(row.resultTitle);
                const observedAt = stringValue(row.observedAt);
                return (
                  <tr key={`${query}-${observedAt ?? index}`}>
                    <th scope="row">{query}</th>
                    <td>{position === null ? "100위 밖 또는 확인 불가" : <strong>{formatNumberKo(position)}위</strong>}</td>
                    <td>{url ? <a href={url} target="_blank" rel="noreferrer">{title ?? url}</a> : "결과 URL 없음"}</td>
                    <td>{observedAt ? formatDateTimeKo(observedAt) : "확인 불가"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionFrame>
  );
}

const aioPresenceCopy: Readonly<Record<string, string>> = {
  present: "AI Overview 확인됨",
  absent: "AI Overview 미노출",
  unknown: "응답 판별 불가",
};

function AioSection({ section }: { section: ReportSectionView }) {
  const observations = records(section.data.observations);
  return (
    <SectionFrame section={section} title="AI Overview" description="질문별 노출·인용 확인">
      {observations.length === 0 ? <p className="sf-empty-inline">확인된 AI Overview 관측값이 없습니다.</p> : (
        <ul className="sf-evidence-list">
          {observations.map((row, index) => {
            const query = stringValue(row.query) ?? "질문 확인 불가";
            const presence = stringValue(row.presence) ?? "unknown";
            const observedAt = stringValue(row.observedAt);
            const answer = stringValue(row.answerText);
            const citations = Array.isArray(row.citations) ? row.citations.length : null;
            return (
              <li key={`${query}-${observedAt ?? index}`}>
                <div className="sf-record__title-row"><h3>{query}</h3><span className="sf-state-chip">{aioPresenceCopy[presence] ?? "상태 확인 불가"}</span></div>
                {answer ? <p>{answer}</p> : <p className="sf-ink-soft">저장된 답변 본문이 없습니다.</p>}
                <small>{observedAt ? formatDateTimeKo(observedAt) : "관측 시각 확인 불가"}{citations === null ? " · 인용 정보 확인 불가" : ` · 저장된 인용 ${citations}건`}</small>
              </li>
            );
          })}
        </ul>
      )}
    </SectionFrame>
  );
}

function NaverSection({ section }: { section: ReportSectionView }) {
  const observations = records(section.data.observations);
  return (
    <SectionFrame section={section} title="NAVER 수요" description="검색광고·DataLab·블로그 출처">
      {observations.length === 0 ? <p className="sf-empty-inline">확인된 NAVER 관측값이 없습니다.</p> : (
        <div className="sf-table-scroll" tabIndex={0} role="region" aria-label="NAVER 수요 관측 표">
          <table className="sf-data-table">
            <thead><tr><th scope="col">검색어</th><th scope="col">PC 월간량</th><th scope="col">모바일 월간량</th><th scope="col">블로그 결과</th><th scope="col">수집 시각</th></tr></thead>
            <tbody>{observations.map((row, index) => {
              const query = stringValue(row.query) ?? "검색어 확인 불가";
              const collectedAt = stringValue(row.collectedAt) ?? stringValue(row.observedAt);
              const values = [row.monthlyPcSearchVolume, row.monthlyMobileSearchVolume, row.blogResultCount].map(numberValue);
              return <tr key={`${query}-${collectedAt ?? index}`}><th scope="row">{query}</th>{values.map((value, valueIndex) => <td key={valueIndex}>{value === null ? "확인 불가" : formatNumberKo(value)}</td>)}<td>{collectedAt ? formatDateTimeKo(collectedAt) : "확인 불가"}</td></tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </SectionFrame>
  );
}

function GscRows({ rows, label }: { rows: readonly Record<string, unknown>[]; label: string }) {
  if (rows.length === 0) return <p className="sf-empty-inline">{label}에 확인된 Search Console 행이 없습니다.</p>;
  return (
    <div className="sf-table-scroll" tabIndex={0} role="region" aria-label={`${label} Search Console 표`}>
      <table className="sf-data-table">
        <thead><tr><th scope="col">데이터 날짜</th><th scope="col">클릭</th><th scope="col">노출</th><th scope="col">CTR</th><th scope="col">평균 게재순위</th></tr></thead>
        <tbody>{rows.map((row, index) => {
          const date = stringValue(row.dataDate);
          const clicks = numberValue(row.clicks);
          const impressions = numberValue(row.impressions);
          const ctr = numberValue(row.ctr);
          const position = numberValue(row.position);
          return <tr key={`${date ?? "date"}-${index}`}><th scope="row">{date ? formatCalendarDateKo(date) : "확인 불가"}</th><td>{clicks === null ? "확인 불가" : formatNumberKo(clicks)}</td><td>{impressions === null ? "확인 불가" : formatNumberKo(impressions)}</td><td>{ctr === null ? "확인 불가" : `${formatNumberKo(ctr * 100)}%`}</td><td>{position === null ? "확인 불가" : formatNumberKo(position)}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function GscSection({ section }: { section: ReportSectionView }) {
  const current = records(section.data.current);
  const comparison = records(section.data.comparison);
  return (
    <SectionFrame section={section} title="Google Search Console" description="완결된 PT 날짜 구간">
      <div className="sf-page-stack sf-page-stack--compact">
        <section><h3>현재 기간</h3><GscRows rows={current} label="현재 기간" /></section>
        <section><h3>비교 기간</h3><GscRows rows={comparison} label="비교 기간" /></section>
      </div>
    </SectionFrame>
  );
}

export function ReportSnapshotView({ report }: { report: ReportDetailViewModel }) {
  const sections = report.snapshot.sections;
  const partial = report.status === "partial" || Object.values(sections).some((section) => !section.available);
  const style = { "--sf-report-accent": report.snapshot.brand.accentColor } as CSSProperties;
  return (
    <article className="sf-report-snapshot" style={style} aria-labelledby="snapshot-title">
      <header className="sf-snapshot-cover">
        <div>
          <p className="sf-eyebrow">{report.snapshot.brand.name}</p>
          <h2 id="snapshot-title">발행 후 변경되지 않는 스냅샷</h2>
          <p>{formatPeriodKo(report.snapshot.period.current.start, report.snapshot.period.current.end)}</p>
        </div>
        <div className="sf-snapshot-cover__status">
          <span className={`sf-state-chip ${partial ? "sf-state-chip--warning" : "sf-state-chip--success"}`}>{partial ? "일부 데이터" : "전체 데이터 확인"}</span>
          <small>{formatDateTimeKo(report.snapshot.capturedAt)} KST 고정</small>
        </div>
      </header>
      {partial ? <StatusPanel status="partial" title="일부 데이터로 발행되었습니다" description="확인 가능한 값만 표시하며 누락된 공급자 영역을 임의 수치로 채우지 않습니다." /> : null}
      <section className="sf-snapshot-meta" aria-label="스냅샷 기준">
        <dl>
          <div><dt>현재 기간</dt><dd>{formatPeriodKo(report.snapshot.period.current.start, report.snapshot.period.current.end)} (PT)</dd></div>
          <div><dt>비교 기간</dt><dd>{formatPeriodKo(report.snapshot.period.comparison.start, report.snapshot.period.comparison.end)} (PT)</dd></div>
          <div><dt>수집 시작</dt><dd>{formatDateTimeKo(report.snapshot.schedule.collectionAt)} KST</dd></div>
          <div><dt>스냅샷 고정</dt><dd>{formatDateTimeKo(report.snapshot.schedule.snapshotAt)} KST</dd></div>
        </dl>
      </section>
      <RankSection section={sections.rank} />
      <AioSection section={sections.aio} />
      <NaverSection section={sections.naver} />
      <GscSection section={sections.gsc} />
    </article>
  );
}

export function ReportDetailWorkspace({ reportId }: { reportId: string }) {
  const endpoint = `/api/v1/reports/${encodeURIComponent(reportId)}` as `/api/v1/${string}`;
  const { state, reload } = useApiResource(endpoint, parseReportDetail);
  const { access, summaryState } = useBillingAccess();
  return (
    <ResourcePanel state={state} label="리포트 상세" onRetry={reload}>
      {(report) => {
        const currentPeriodStart = summaryState.status === "ready" ? summaryState.data.currentPeriodStart : null;
        const blockedByPastDue = access.pastReportsOnly && (!currentPeriodStart || report.period.end >= currentPeriodStart.slice(0, 10));
        return blockedByPastDue ? (
          <div className="sf-page-stack">
            <StatusPanel status="error" title="현재 청구기간 리포트는 열 수 없습니다" description="미납 유예 기간에는 현재 청구기간보다 앞선 불변 리포트만 읽을 수 있습니다." />
            <ReportPdfDownload reportId={reportId} blockedByPastDue />
          </div>
        ) : (
          <div className="sf-page-stack">
            <ReportPdfDownload reportId={reportId} blockedByPastDue={false} />
            <ReportSnapshotView report={report} />
          </div>
        );
      }}
    </ResourcePanel>
  );
}
