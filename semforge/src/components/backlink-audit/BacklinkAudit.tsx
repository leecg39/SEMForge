"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircledIcon,
  FileTextIcon,
  GlobeIcon,
  Link2Icon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { BacklinkAuditLinks } from "@/components/backlink-audit/BacklinkAuditLinks";
import { BacklinkAuditOverviewPanel } from "@/components/backlink-audit/BacklinkAuditOverview";
import { BacklinkDisavowPanel } from "@/components/backlink-audit/BacklinkDisavowPanel";
import { BacklinkRemovalPanel } from "@/components/backlink-audit/BacklinkRemovalPanel";
import { useLocale } from "@/i18n/LocaleProvider";
import { api } from "@/lib/client-api";
import type {
  AuditOverview,
  AuditProjectSummary,
  AuditRunSummary,
  AuditSourceOption,
} from "@/server/backlink-audit/contracts";

export type BacklinkAuditTab = "overview" | "audit" | "removal" | "disavow" | "changes" | "targets" | "settings";

function dateTime(value: string | null, locale: "ko" | "en") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

function providerLabel(provider: "bing-webmaster" | "bing-csv" | "common-crawl", ko: boolean) {
  if (provider === "common-crawl") return "Common Crawl";
  return provider === "bing-csv" ? (ko ? "이전 Bing CSV" : "Legacy Bing CSV") : "Bing Webmaster API";
}

export function BacklinkAudit({ initialProjectId, initialTab }: {
  initialProjectId: string;
  initialTab: BacklinkAuditTab;
}) {
  const { locale } = useLocale(); const ko = locale === "ko";
  const router = useRouter();
  const [projects, setProjects] = useState<AuditProjectSummary[]>([]);
  const [sources, setSources] = useState<AuditSourceOption[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [tab, setTab] = useState<BacklinkAuditTab>(initialTab);
  const [overview, setOverview] = useState<AuditOverview | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [maxLinks, setMaxLinks] = useState<100 | 500 | 1000>(100);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateUrl = (nextProject: string, nextTab: BacklinkAuditTab) => {
    const params = new URLSearchParams();
    if (nextProject) params.set("project", nextProject);
    if (nextProject && nextTab !== "overview") params.set("tab", nextTab);
    router.replace(`/backlink_audit/${params.size ? `?${params}` : ""}`, { scroll: false });
  };

  const loadOverview = useCallback(async (id: string) => {
    if (!id) { setOverview(null); return; }
    const { data } = await api.get<AuditOverview>(`/api/backlink-audits/projects/${id}/overview/`);
    setOverview(data);
  }, []);

  const loadBase = useCallback(async () => {
    const [projectResult, sourceResult] = await Promise.all([
      api.get<AuditProjectSummary[]>("/api/backlink-audits/projects/"),
      api.get<AuditSourceOption[]>("/api/backlink-audits/sources/"),
    ]);
    setProjects(projectResult.data); setSources(sourceResult.data);
    setSourceId((current) => current || sourceResult.data[0]?.reportId || "");
    return projectResult.data;
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try { await Promise.all([loadBase(), projectId ? loadOverview(projectId) : Promise.resolve()]); }
    catch (reason) { setError(reason instanceof Error ? reason.message : (ko ? "감사 데이터를 불러오지 못했습니다." : "Could not load audit data.")); }
  }, [ko, loadBase, loadOverview, projectId]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      loadBase().then(async (items) => {
        if (!active) return;
        const selected = initialProjectId && items.some((item) => item.id === initialProjectId) ? initialProjectId : "";
        if (selected) { setProjectId(selected); await loadOverview(selected); }
      }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : (ko ? "감사 작업공간을 불러오지 못했습니다." : "Could not load the audit workspace.")); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [initialProjectId, ko, loadBase, loadOverview]);

  const activeRun = overview?.project.latestRun;
  useEffect(() => {
    if (!projectId || !activeRun || (activeRun.status !== "queued" && activeRun.status !== "running")) return;
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.get<AuditRunSummary>(`/api/backlink-audits/runs/${activeRun.id}/`);
        if (data.status === "completed" || data.status === "failed") await refresh();
        else await loadOverview(projectId);
      } catch { /* 다음 수동 새로고침에서 상태를 복구한다. */ }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [activeRun, loadOverview, projectId, refresh]);

  const selectedProject = useMemo(() => projects.find((item) => item.id === projectId) ?? overview?.project ?? null, [overview?.project, projectId, projects]);

  const openProject = async (id: string) => {
    setProjectId(id); setTab("overview"); setLoading(true); setError(null); updateUrl(id, "overview");
    try { await loadOverview(id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : (ko ? "프로젝트를 열지 못했습니다." : "Could not open the project.")); }
    finally { setLoading(false); }
  };

  const createProject = async (event: FormEvent) => {
    event.preventDefault(); if (!sourceId) return;
    setBusy(true); setError(null);
    try {
      const { data } = await api.post<AuditProjectSummary>("/api/backlink-audits/projects/", { reportId: sourceId, maxLinks });
      await loadBase(); await openProject(data.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : (ko ? "감사 프로젝트를 만들지 못했습니다." : "Could not create the audit project.")); }
    finally { setBusy(false); }
  };

  const startRun = async () => {
    if (!projectId) return;
    setBusy(true); setError(null);
    try {
      await api.post<AuditRunSummary>(`/api/backlink-audits/projects/${projectId}/runs/`, { maxLinks });
      await Promise.all([loadBase(), loadOverview(projectId)]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : (ko ? "감사를 시작하지 못했습니다." : "Could not start the audit.")); }
    finally { setBusy(false); }
  };

  if (loading && !overview && projectId) return <div className="grid min-h-[480px] place-items-center p-8"><div className="text-center"><ReloadIcon className="mx-auto h-5 w-5 animate-spin text-[#6557e8]" /><p className="mt-3 text-[12px] text-app-text-secondary">{ko ? "감사 프로젝트를 불러오는 중…" : "Loading audit project…"}</p></div></div>;

  if (!projectId || !selectedProject) return <div className="mx-auto w-full max-w-[1180px] p-4 sm:p-6">
    <section className="overflow-hidden rounded-[14px] border border-app-border bg-white shadow-sm"><div className="bg-[radial-gradient(circle_at_82%_16%,#eeeaff_0,transparent_31%),radial-gradient(circle_at_13%_10%,#e1f6ef_0,transparent_28%)] px-5 py-10 sm:px-12 sm:py-14"><div className="mx-auto max-w-[760px] text-center"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold text-[#6557e8]"><CheckCircledIcon />{ko ? "설명 가능한 실제 백링크 감사" : "Explainable backlink audit"}</span><h1 className="mt-4 text-[30px] font-bold tracking-[-0.6px] text-app-text sm:text-[36px]">{ko ? "위험 신호를 확인하고 조치하세요" : "Review link risks and take action"}</h1><p className="mx-auto mt-3 max-w-[690px] text-[13px] leading-6 text-app-text-secondary">{ko ? "Bing Webmaster 또는 Common Crawl에서 발견한 링크를 Firecrawl로 다시 확인합니다. 외부 독성 점수나 가짜 수치는 사용하지 않습니다." : "Recheck links discovered by Bing Webmaster or Common Crawl with Firecrawl. No fabricated metrics or opaque toxicity scores."}</p></div>
      <div className="mx-auto mt-7 max-w-[850px] rounded-[12px] border border-app-border bg-white p-5 shadow-[0_8px_28px_rgba(25,32,54,0.09)]"><div className="grid gap-2 sm:grid-cols-3">{[{ icon: <Link2Icon />, text: ko ? "백링크 보고서 선택" : "Choose a report" }, { icon: <GlobeIcon />, text: ko ? "실제 링크 재확인" : "Recheck real links" }, { icon: <CheckCircledIcon />, text: ko ? "검토·삭제·거부" : "Review and action" }].map((step) => <div key={step.text} className="flex items-center gap-2 rounded-[8px] bg-[#f7f8fa] px-3 py-2.5 text-[11px] font-medium text-app-text"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#6557e8]">{step.icon}</span>{step.text}</div>)}</div>
        {sources.length > 0 ? <form onSubmit={createProject} className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto]"><label><span className="mb-1.5 block text-[10px] font-medium text-app-text-secondary">{ko ? "백링크 분석 결과" : "Backlink report"}</span><select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[11px]">{sources.map((source) => <option key={source.reportId} value={source.reportId}>{new URL(source.siteUrl).hostname} · {providerLabel(source.provider, ko)} · {source.totalInboundLinks === null ? "—" : source.totalInboundLinks.toLocaleString()}</option>)}</select></label><label><span className="mb-1.5 block text-[10px] font-medium text-app-text-secondary">{ko ? "첫 감사 범위" : "Initial coverage"}</span><select value={maxLinks} onChange={(event) => setMaxLinks(Number(event.target.value) as 100 | 500 | 1000)} className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[11px]"><option value={100}>100</option><option value={500}>500</option><option value={1000}>1,000</option></select></label><button disabled={busy || !sourceId} className="mt-[22px] h-11 rounded-[7px] bg-[#171a26] px-5 text-[11px] font-semibold text-white disabled:opacity-40">{busy ? (ko ? "만드는 중…" : "Creating…") : (ko ? "감사 프로젝트 만들기" : "Create audit project")}</button></form> : <div className="mt-4 rounded-[8px] border border-[#efd59b] bg-[#fff9eb] p-4"><p className="text-[12px] font-semibold text-app-text">{ko ? "사용할 백링크 분석 결과가 없습니다" : "No backlink report is available"}</p><p className="mt-1 text-[10px] leading-5 text-app-text-secondary">{ko ? "먼저 Bing 또는 Common Crawl 자동 분석을 실행하세요." : "Run Bing or Common Crawl automatic analysis first."}</p><Link href="/analytics/backlinks/overview/" className="mt-3 inline-flex h-9 items-center rounded-[7px] bg-[#171a26] px-4 text-[10px] font-semibold text-white">{ko ? "백링크 분석 열기" : "Open backlink analytics"}</Link></div>}
        {error && <p className="mt-3 rounded-[7px] bg-[#fff0f1] px-3 py-2 text-[11px] text-[#a12828]">{error}</p>}
      </div></div></section>
    {projects.length > 0 && <section className="mt-4 rounded-[10px] border border-app-border bg-white p-5"><h2 className="text-[13px] font-semibold text-app-text">{ko ? "기존 감사 프로젝트" : "Existing audit projects"}</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{projects.map((project) => <button key={project.id} type="button" onClick={() => void openProject(project.id)} className="rounded-[8px] border border-app-border p-4 text-left hover:border-[#8d82ed] hover:bg-[#fbfaff]"><div className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold text-app-text">{project.name}</span><span className="rounded-full bg-[#f2f3f5] px-2 py-1 text-[9px] text-app-text-secondary">{providerLabel(project.sourceProvider, ko)}</span></div><p className="mt-1 truncate text-[10px] text-app-text-secondary">{project.siteUrl}</p><div className="mt-3 flex gap-4 text-[10px] text-app-text-secondary"><span>{ko ? "링크" : "Links"} <strong className="text-app-text">{project.totalLinks.toLocaleString()}</strong></span><span>{ko ? "미검토" : "Pending"} <strong className="text-app-text">{project.pendingLinks.toLocaleString()}</strong></span><span>{ko ? "위험" : "Risk"} <strong className="text-[#b42332]">{project.riskyLinks.toLocaleString()}</strong></span></div></button>)}</div></section>}
  </div>;

  const run = overview?.project.latestRun;
  const running = run?.status === "queued" || run?.status === "running";
  const tabs: Array<{ id: BacklinkAuditTab; label: string }> = [
    { id: "overview", label: ko ? "개요" : "Overview" },
    { id: "audit", label: ko ? "진단" : "Audit" },
    { id: "removal", label: ko ? "삭제" : "Removal" },
    { id: "disavow", label: ko ? "거부" : "Disavow" },
    { id: "changes", label: ko ? "신규·누락" : "New & lost" },
    { id: "targets", label: ko ? "대상 페이지" : "Target pages" },
    { id: "settings", label: ko ? "정보" : "Info" },
  ];

  return <div className="p-4 sm:p-6"><div className="mx-auto max-w-[1480px]">
    <header><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-bold tracking-[-0.3px] text-app-text">{selectedProject.name}</h1><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${selectedProject.sourceProvider === "common-crawl" ? "bg-[#e9f7ef] text-[#15704e]" : selectedProject.sourceProvider === "bing-csv" ? "bg-[#fff3dc] text-[#8a5a00]" : "bg-[#eaf3ff] text-[#235fe2]"}`}>{providerLabel(selectedProject.sourceProvider, ko)}</span></div><p className="mt-1 text-[11px] text-app-text-secondary">{selectedProject.siteUrl} · {ko ? "마지막 감사" : "Last audited"} {dateTime(overview?.project.lastCollectedAt ?? null, locale)}</p></div><div className="flex flex-wrap items-end gap-2"><label><span className="mb-1 block text-[9px] text-app-text-secondary">{ko ? "감사 범위" : "Coverage"}</span><select value={maxLinks} onChange={(event) => setMaxLinks(Number(event.target.value) as 100 | 500 | 1000)} disabled={running} className="h-9 rounded-[7px] border border-app-border bg-white px-2 text-[10px]"><option value={100}>100</option><option value={500}>500</option><option value={1000}>1,000</option></select></label><button type="button" disabled={busy || running || !selectedProject.sourceReportId} onClick={() => void startRun()} className="inline-flex h-9 items-center gap-1.5 rounded-[7px] bg-[#171a26] px-4 text-[10px] font-semibold text-white disabled:opacity-40"><ReloadIcon className={running ? "animate-spin" : ""} />{running ? (ko ? "감사 실행 중" : "Audit running") : overview?.totals.links ? (ko ? "다시 감사" : "Run again") : (ko ? "감사 시작" : "Start audit")}</button><button type="button" onClick={() => void openProject("")} className="h-9 rounded-[7px] border border-app-border bg-white px-3 text-[10px] font-semibold text-app-text">{ko ? "프로젝트 변경" : "Change project"}</button></div></div>
      {error && <p className="mt-3 rounded-[7px] bg-[#fff0f1] px-3 py-2 text-[11px] text-[#a12828]">{error}</p>}
      {overview?.project.lastErrorMessage && <p className="mt-3 rounded-[7px] border border-[#efd59b] bg-[#fff9eb] px-3 py-2 text-[11px] text-[#73551b]">{overview.project.lastErrorMessage}</p>}
      {run?.warningMessage && <p className="mt-3 rounded-[7px] border border-[#efd59b] bg-[#fff9eb] px-3 py-2 text-[11px] text-[#73551b]">{run.warningMessage}</p>}
    </header>

    {running && run && <section className="mt-4 rounded-[9px] border border-[#dcd8ff] bg-[#f8f7ff] p-4"><div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-semibold text-[#5547c8]">{run.status === "queued" ? (ko ? "감사를 준비하고 있습니다" : "Preparing audit") : (ko ? "실제 링크를 확인하고 있습니다" : "Checking real links")}</span><span className="text-app-text-secondary">{run.processedLinks.toLocaleString()} / {Math.max(run.discoveredLinks, run.requestedLinks).toLocaleString()}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#6557e8] transition-[width]" style={{ width: `${Math.min(100, run.discoveredLinks ? run.processedLinks / run.discoveredLinks * 100 : 3)}%` }} /></div></section>}

    {!overview?.totals.links && !running ? <section className="mt-4 rounded-[10px] border border-app-border bg-white p-8 text-center"><FileTextIcon className="mx-auto h-7 w-7 text-[#6557e8]" /><h2 className="mt-3 text-[15px] font-semibold text-app-text">{ko ? "첫 백링크 감사를 시작하세요" : "Start the first backlink audit"}</h2><p className="mx-auto mt-2 max-w-[600px] text-[11px] leading-5 text-app-text-secondary">{ko ? "선택한 백링크 보고서의 실제 링크를 가져오고, 출처 페이지에서 링크 존재 여부와 속성을 재확인합니다." : "Load real links from the selected report and recheck their existence and attributes on source pages."}</p><button type="button" disabled={busy || !selectedProject.sourceReportId} onClick={() => void startRun()} className="mt-5 h-10 rounded-[7px] bg-[#171a26] px-5 text-[11px] font-semibold text-white disabled:opacity-40">{ko ? `${maxLinks.toLocaleString()}개 링크 감사 시작` : `Audit up to ${maxLinks.toLocaleString()} links`}</button></section> : <>
      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-app-border">{tabs.map((item) => <button key={item.id} type="button" onClick={() => { setTab(item.id); updateUrl(projectId, item.id); }} className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-[11px] font-medium ${tab === item.id ? "border-[#6557e8] text-app-text" : "border-transparent text-app-text-secondary hover:text-app-text"}`}>{item.label}</button>)}</nav>
      <main className="mt-4">
        {tab === "overview" && overview && <BacklinkAuditOverviewPanel overview={overview} locale={locale} />}
        {tab === "audit" && <BacklinkAuditLinks projectId={projectId} locale={locale} onChanged={refresh} />}
        {tab === "removal" && <BacklinkRemovalPanel projectId={projectId} locale={locale} onChanged={refresh} />}
        {tab === "disavow" && <BacklinkDisavowPanel projectId={projectId} locale={locale} onChanged={refresh} />}
        {tab === "changes" && <BacklinkAuditLinks projectId={projectId} locale={locale} mode="changes" onChanged={refresh} />}
        {tab === "targets" && overview && <section className="overflow-hidden rounded-[9px] border border-app-border bg-white"><div className="border-b border-app-border p-5"><h2 className="text-[14px] font-semibold text-app-text">{ko ? "대상 페이지" : "Target pages"}</h2><p className="mt-1 text-[10px] text-app-text-secondary">{ko ? "실제 인바운드 링크가 도달하는 페이지와 최근 확인된 HTTP 상태입니다." : "Pages receiving real inbound links and their latest HTTP status."}</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[11px]"><thead className="bg-[#f8f9fb] text-[10px] text-app-text-secondary"><tr><th className="px-4 py-2.5">URL</th><th className="px-4 py-2.5 text-right">{ko ? "링크" : "Links"}</th><th className="px-4 py-2.5 text-right">{ko ? "출처 도메인" : "Domains"}</th><th className="px-4 py-2.5 text-right">HTTP</th></tr></thead><tbody>{overview.topTargets.map((row) => <tr key={row.targetUrl} className="border-t border-[#eef0f2]"><td className="max-w-[560px] truncate px-4 py-3"><a href={row.targetUrl} target="_blank" rel="noopener noreferrer" className="text-[#285fca] hover:underline">{row.targetUrl}</a></td><td className="px-4 py-3 text-right">{row.links.toLocaleString()}</td><td className="px-4 py-3 text-right">{row.sourceDomains.toLocaleString()}</td><td className={`px-4 py-3 text-right font-semibold ${row.status && row.status >= 400 ? "text-[#b42332]" : "text-app-text-secondary"}`}>{row.status ?? "—"}</td></tr>)}</tbody></table></div></section>}
        {tab === "settings" && <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-[9px] border border-app-border bg-white p-5"><h2 className="text-[14px] font-semibold text-app-text">{ko ? "프로젝트 정보" : "Project information"}</h2><dl className="mt-4 space-y-3 text-[11px]"><div className="flex justify-between gap-4 border-b border-[#eef0f2] pb-3"><dt className="text-app-text-secondary">{ko ? "사이트" : "Site"}</dt><dd className="truncate font-medium text-app-text">{selectedProject.siteUrl}</dd></div><div className="flex justify-between gap-4 border-b border-[#eef0f2] pb-3"><dt className="text-app-text-secondary">{ko ? "출처" : "Source"}</dt><dd>{providerLabel(selectedProject.sourceProvider, ko)}</dd></div><div className="flex justify-between gap-4 border-b border-[#eef0f2] pb-3"><dt className="text-app-text-secondary">{ko ? "원본 보고서" : "Source report"}</dt><dd className="font-mono text-[9px]">{selectedProject.sourceReportId ?? (ko ? "만료됨" : "Expired")}</dd></div><div className="flex justify-between gap-4"><dt className="text-app-text-secondary">{ko ? "마지막 감사" : "Last audit"}</dt><dd>{dateTime(overview?.project.lastCollectedAt ?? null, locale)}</dd></div></dl></article><article className="rounded-[9px] border border-app-border bg-white p-5"><h2 className="text-[14px] font-semibold text-app-text">{ko ? "판정 원칙" : "Assessment principles"}</h2><ul className="mt-4 space-y-2 text-[10px] leading-5 text-app-text-secondary"><li>• {ko ? "차단·시간 초과는 위험으로 판정하지 않고 확인 불가로 남깁니다." : "Blocked and timed-out pages remain unavailable, never risky by default."}</li><li>• {ko ? "위험도는 대상 오류, 링크 집중, 반복 앵커 등 표시된 근거만 사용합니다." : "Priority uses only disclosed evidence such as broken targets, concentration and repeated anchors."}</li><li>• {ko ? "사용자 수동 판정은 다음 감사에서도 유지됩니다." : "Manual decisions persist across future audit runs."}</li><li>• {ko ? "거부 목록은 자동 제출하지 않으며 다운로드만 제공합니다." : "Disavow entries are never auto-submitted; only a download is provided."}</li></ul></article></section>}
      </main>
    </>}
  </div></div>;
}
