"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Cross2Icon,
  DownloadIcon,
  GearIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ReloadIcon,
  StarFilledIcon,
  StarIcon,
} from "@radix-ui/react-icons";
import type { AiVisibilityProvider } from "@/db/schema";
import { api, ClientApiError } from "@/lib/client-api";
import type {
  PromptResearchDashboardResponse,
  PromptResearchGeneratedResponse,
  PromptResearchIntent,
  PromptResearchPromptRow,
  PromptResearchRelevance,
  PromptResearchTopicRow,
} from "@/server/ai-visibility/prompt-research";
import type { AiVisibilityProjectListItem, AiVisibilitySettingsView } from "@/server/ai-visibility/projects";
import type { AiVisibilityRunView } from "@/server/ai-visibility/runs";
import { AiVisibilityPromptManager, AiVisibilitySettingsPanel, type AiVisibilityPromptRow } from "./AiVisibilityProjectSetup";

interface Props { initialFolderId?: string }
type ResearchTab = "topics" | "prompts" | "brands" | "sources";

const CARD = "rounded-[8px] border border-[#dde1e6] bg-white shadow-[0_1px_2px_rgba(20,28,45,0.025)]";
const BUTTON = "inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] border border-[#d5d9df] bg-white px-3 text-[11px] font-medium text-[#3d434c] transition hover:bg-[#f5f6f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6f6de8]/35 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = "inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] bg-[#202421] px-3.5 text-[11px] font-semibold text-white transition hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6f6de8]/35 disabled:cursor-not-allowed disabled:bg-[#afb3ba]";
const PROVIDER_LABELS: Record<AiVisibilityProvider, string> = { google_aio: "Google AI 개요", chatgpt_web: "ChatGPT", gemini_grounded: "Gemini" };
const INTENT_LABELS: Record<PromptResearchIntent, string> = { informational: "정보성", exploratory: "탐색형", commercial: "상업성", transactional: "거래형" };
const INTENT_COLORS: Record<PromptResearchIntent, string> = { informational: "bg-[#91a5f5]", exploratory: "bg-[#b78bf5]", commercial: "bg-[#f0bc4e]", transactional: "bg-[#4dd2ad]" };
const RELEVANCE_LABELS: Record<PromptResearchRelevance, string> = { high: "높음", medium: "보통", low: "낮음" };

function errorMessage(error: unknown, fallback: string) { return error instanceof ClientApiError ? error.message : fallback; }
function normalize(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase(); }
function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value)); }

function IntentBar({ intents }: { intents: Record<PromptResearchIntent, number> }) {
  const total = Object.values(intents).reduce((sum, count) => sum + count, 0);
  return <div className="flex h-1.5 w-full max-w-[150px] overflow-hidden rounded-full bg-[#eef0f3]" role="img" aria-label={Object.entries(intents).map(([key, count]) => `${INTENT_LABELS[key as PromptResearchIntent]} ${count}`).join(", ")}>{(Object.keys(INTENT_LABELS) as PromptResearchIntent[]).map((intent) => intents[intent] > 0 && <span key={intent} className={INTENT_COLORS[intent]} style={{ width: `${(intents[intent] / Math.max(1, total)) * 100}%` }} />)}</div>;
}

function Relevance({ value }: { value: PromptResearchRelevance }) {
  return <span className="inline-flex items-center gap-1 text-[10px] text-[#636a74]"><i className={`h-2 w-2 rounded-full ${value === "high" ? "bg-emerald-500" : value === "medium" ? "bg-amber-400" : "bg-red-400"}`} />{RELEVANCE_LABELS[value]}</span>;
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="min-w-0 border-b border-[#e6e8eb] px-4 py-4 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-[10px] font-medium text-[#535a64]">{label}</p><p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#2a2f36]">{value}</p>{note && <p className="mt-1 truncate text-[9px] text-[#8b9199]">{note}</p>}</div>;
}

function LoadingState() {
  return <div role="status" aria-live="polite" className="space-y-3"><div className={`${CARD} h-[160px] animate-pulse bg-[#eceef1]`} /><div className={`${CARD} h-[430px] animate-pulse bg-[#eceef1]`} /><span className="sr-only">프롬프트 리서치를 불러오는 중입니다.</span></div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#edf0ff] text-[#5e62da]"><MagnifyingGlassIcon width={20} height={20} /></span><h3 className="mt-3 text-[14px] font-semibold text-[#353b43]">{title}</h3><p className="mt-2 max-w-[520px] text-[11px] leading-5 text-[#7b828c]">{body}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

function PromptDetail({ row }: { row: PromptResearchPromptRow }) {
  return <div className="border-t border-[#e7e9ed] bg-[#fafbfc] px-4 py-3 text-[10px] leading-5 text-[#69717b] md:px-5"><div className="grid gap-3 sm:grid-cols-3"><div><b className="font-medium text-[#3f4650]">언급 브랜드</b><p>{row.brandNames.join(", ") || "관측 없음"}</p></div><div><b className="font-medium text-[#3f4650]">인용 소스</b><p>{row.sourceDomains.join(", ") || "수집된 인용 URL 없음"}</p></div><div><b className="font-medium text-[#3f4650]">실제 관측</b><p>{row.observed ? `${row.responseCount}개 응답 · ${row.capturedAt ? formatDate(row.capturedAt) : ""}` : "아직 수집하지 않음"}</p></div></div></div>;
}

function DataTable({
  tab,
  prompts,
  topics,
  brands,
  sources,
  filter,
  intent,
  expanded,
  onExpanded,
  onMonitor,
  busyId,
}: {
  tab: ResearchTab;
  prompts: PromptResearchPromptRow[];
  topics: PromptResearchTopicRow[];
  brands: PromptResearchDashboardResponse["research"]["brands"];
  sources: PromptResearchDashboardResponse["research"]["sources"];
  filter: string;
  intent: "all" | PromptResearchIntent;
  expanded: string | null;
  onExpanded: (id: string | null) => void;
  onMonitor: (row: PromptResearchPromptRow) => void;
  busyId: string | null;
}) {
  const query = normalize(filter);
  const promptRows = prompts.filter((row) => (!query || normalize(`${row.prompt} ${row.topic}`).includes(query)) && (intent === "all" || row.intent === intent));
  const topicRows = topics.filter((row) => !query || normalize(row.label).includes(query));
  const entityRows = (tab === "brands" ? brands : sources).filter((row) => !query || normalize(row.label).includes(query));
  if (tab === "brands" || tab === "sources") {
    return <div className="divide-y divide-[#e7e9ed]">{entityRows.length === 0 ? <EmptyState title={tab === "brands" ? "언급 브랜드가 없습니다" : "인용 소스가 없습니다"} body={tab === "brands" ? "응답 본문을 수집·분석하면 실제 언급 브랜드가 여기에 표시됩니다." : "공급자가 실제 인용 URL을 반환한 경우에만 소스 도메인을 표시합니다."} /> : entityRows.map((row) => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_90px_90px] items-center gap-3 px-4 py-3 text-[11px] md:px-5"><div className="font-medium text-[#343a42]">{row.label}</div><div className="text-right text-[#6e7580]">프롬프트 {row.promptCount}</div><div className="text-right font-semibold text-[#4d54c9]">근거 {row.evidenceCount}</div></div>)}</div>;
  }
  if (tab === "topics") {
    return <div className="divide-y divide-[#e7e9ed]">{topicRows.length === 0 ? <EmptyState title="일치하는 주제가 없습니다" body="검색어나 필터를 바꾸거나 새 프롬프트 리서치를 실행해 보세요." /> : topicRows.map((row) => <div key={row.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_88px_100px_170px_105px] md:items-center md:px-5"><div><p className="text-[11px] font-medium text-[#343a42]">{row.label}</p><p className="mt-0.5 text-[9px] text-[#9298a1]">프롬프트 {row.promptCount} · 실제 응답 {row.observedAnswers}</p></div><Relevance value={row.relevance} /><span className="text-[10px] text-[#6c737d]">모니터링 {row.monitoredCount}</span><IntentBar intents={row.intents} /><span className="text-[10px] text-[#6c737d]">브랜드 {row.brandNames.length}</span></div>)}</div>;
  }
  return <div className="divide-y divide-[#e7e9ed]">{promptRows.length === 0 ? <EmptyState title="일치하는 프롬프트가 없습니다" body="필터를 초기화하거나 상단 검색창에서 새로운 AI 질문 후보를 생성하세요." /> : promptRows.map((row) => <div key={row.id}><div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_88px_105px_120px_105px] md:items-center md:px-5"><button type="button" className="flex min-w-0 items-start gap-2 text-left" aria-expanded={expanded === row.id} onClick={() => onExpanded(expanded === row.id ? null : row.id)}>{expanded === row.id ? <ChevronDownIcon className="mt-0.5 shrink-0" /> : <ChevronRightIcon className="mt-0.5 shrink-0" />}<span><b className="block text-[11px] font-medium leading-5 text-[#333941]">{row.prompt}</b><small className="block text-[9px] text-[#959ba4]">{row.topic}{!row.observed && " · 생성 후보"}</small></span></button><Relevance value={row.relevance} /><span className="text-[10px] text-[#656c76]">{INTENT_LABELS[row.intent]}</span><div><span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] ${row.observed ? "bg-emerald-50 text-emerald-700" : "bg-[#f0f2f5] text-[#7c838d]"}`}>{row.observed ? `실측 ${row.responseCount}` : "미수집"}</span></div><button className={row.monitored ? BUTTON : PRIMARY} disabled={row.monitored || busyId === row.id} onClick={() => onMonitor(row)}>{row.monitored ? <><CheckIcon /> 모니터링 중</> : busyId === row.id ? "추가 중…" : <><PlusIcon /> 모니터링</>}</button></div>{expanded === row.id && <PromptDetail row={row} />}</div>)}</div>;
}

function Onboarding({ projects, onOpen }: { projects: AiVisibilityProjectListItem[]; onOpen: (fid: string) => void }) {
  return <div className="min-h-[calc(100dvh-64px)] bg-[#f4f5f7] px-4 py-12"><div className="mx-auto max-w-[900px] text-center"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5d63d8]">프롬프트 리서치</p><h1 className="mt-3 text-[34px] font-bold tracking-[-0.04em] text-[#292e35]">사람들이 AI에 묻는 질문을 찾으세요</h1><p className="mx-auto mt-3 max-w-[650px] text-[13px] leading-6 text-[#6f7782]">프로젝트를 선택하면 실제 관측 프롬프트와 AI가 생성한 관련 질문을 한곳에서 조사하고 모니터링할 수 있습니다.</p><div className="mx-auto mt-8 overflow-hidden rounded-[8px] border border-[#dce0e5] bg-white text-left">{projects.map((project) => <button key={project.id} className="flex w-full items-center justify-between border-b border-[#eceef1] px-4 py-3 last:border-0 hover:bg-[#fafbfc]" onClick={() => onOpen(project.id)}><span><b className="block text-[12px] text-[#363c44]">{project.name}</b><small className="text-[9px] text-[#8d939c]">{project.domain}</small></span><span className="text-[10px] font-medium text-[#5e62d6]">열기</span></button>)}</div></div></div>;
}

export function PromptResearchDashboard({ initialFolderId = "" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fid, setFid] = useState(initialFolderId);
  const [projects, setProjects] = useState<AiVisibilityProjectListItem[]>([]);
  const [settings, setSettings] = useState<AiVisibilitySettingsView | null>(null);
  const [promptRows, setPromptRows] = useState<AiVisibilityPromptRow[]>([]);
  const [data, setData] = useState<PromptResearchDashboardResponse | null>(null);
  const [seed, setSeed] = useState("");
  const [generated, setGenerated] = useState<PromptResearchGeneratedResponse | null>(null);
  const [tab, setTab] = useState<ResearchTab>("topics");
  const [filter, setFilter] = useState("");
  const [intent, setIntent] = useState<"all" | PromptResearchIntent>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [showSurvey, setShowSurvey] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<AiVisibilityRunView | null>(null);
  const analysisRequested = useRef(new Set<string>());

  const query = useMemo(() => {
    if (!fid) return "";
    const params = new URLSearchParams({ fid });
    for (const key of ["runId", "provider", "locationKey"] as const) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [fid, searchParams]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const projectResponse = await api.get<AiVisibilityProjectListItem[]>("/api/ai-visibility/projects/");
      setProjects(projectResponse.data);
      if (!fid) { setData(null); return; }
      const settingsResponse = await api.get<AiVisibilitySettingsView>(`/api/ai-visibility/settings/?fid=${encodeURIComponent(fid)}`);
      setSettings(settingsResponse.data);
      const [dashboardResponse, promptsResponse] = await Promise.all([
        api.get<PromptResearchDashboardResponse>(`/api/ai-visibility/prompt-research/?${query || `fid=${encodeURIComponent(fid)}`}`),
        settingsResponse.data.project ? api.get<AiVisibilityPromptRow[]>(`/api/ai-visibility/prompts/?fid=${encodeURIComponent(fid)}`) : Promise.resolve({ data: [] as AiVisibilityPromptRow[] }),
      ]);
      setData(dashboardResponse.data); setPromptRows(promptsResponse.data);
    } catch (cause) { setError(errorMessage(cause, "프롬프트 리서치를 불러오지 못했습니다.")); }
    finally { setLoading(false); }
  }, [fid, query]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!fid) return;
    const saved = window.sessionStorage.getItem(`prompt-research:${fid}`);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as PromptResearchGeneratedResponse;
      const timer = window.setTimeout(() => {
        setGenerated(parsed);
        setSeed(parsed.seed);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    catch { window.sessionStorage.removeItem(`prompt-research:${fid}`); }
  }, [fid]);
  useEffect(() => {
    if (!data?.eligibleForAnalysis || !data.filters.selected.runId || !data.filters.selected.provider || !data.filters.selected.locationKey) return;
    const key = `${data.filters.selected.runId}:${data.filters.selected.provider}:${data.filters.selected.locationKey}`;
    if (analysisRequested.current.has(key)) return;
    analysisRequested.current.add(key);
    void api.post("/api/ai-visibility/brand-performance/analyze/", { fid: data.scope.fid, runId: data.filters.selected.runId, provider: data.filters.selected.provider, locationKey: data.filters.selected.locationKey }).then(() => window.setTimeout(() => void load(), 900)).catch(() => {});
  }, [data, load]);
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const timer = window.setInterval(() => { void api.get<AiVisibilityRunView>(`/api/ai-visibility/runs/${run.id}/`).then(({ data: next }) => { setRun(next); if (next.status !== "queued" && next.status !== "running") { window.clearInterval(timer); void load(); } }); }, 1800);
    return () => window.clearInterval(timer);
  }, [run, load]);

  const navigate = (nextFid: string) => { setFid(nextFid); setGenerated(null); setSeed(""); router.push(`/ai-seo/prompt-research/?fid=${encodeURIComponent(nextFid)}`); };
  const runResearch = async () => {
    if (!fid || seed.trim().length < 2) return;
    setResearching(true); setError(null);
    try {
      const response = await api.post<PromptResearchGeneratedResponse>("/api/ai-visibility/prompt-research/generate/", { fid, seed, count: 10 });
      setGenerated(response.data); setTab("prompts"); setFilter("");
      window.sessionStorage.setItem(`prompt-research:${fid}`, JSON.stringify(response.data));
    } catch (cause) { setError(errorMessage(cause, "관련 프롬프트를 생성하지 못했습니다.")); }
    finally { setResearching(false); }
  };
  const startRun = async () => {
    if (!fid) return;
    setError(null);
    try { const created = await api.post<{ runId: string }>("/api/ai-visibility/runs/", { fid }); const status = await api.get<AiVisibilityRunView>(`/api/ai-visibility/runs/${created.data.runId}/`); setRun(status.data); }
    catch (cause) { setError(errorMessage(cause, "AI 응답 수집을 시작하지 못했습니다.")); }
  };
  const monitor = async (row: PromptResearchPromptRow) => {
    if (!fid || row.monitored) return;
    setBusyId(row.id); setError(null);
    try { await api.post(`/api/ai-visibility/prompts/?fid=${encodeURIComponent(fid)}`, { mode: "prompts", source: "manual", prompts: [{ prompt: row.prompt, topic: row.topic }] }); await load(); }
    catch (cause) { setError(errorMessage(cause, "모니터링 프롬프트를 추가하지 못했습니다.")); }
    finally { setBusyId(null); }
  };
  const updateRun = (key: string) => {
    const option = data?.filters.runs.find((row) => `${row.runId}:${row.provider}:${row.locationKey}` === key);
    if (!option || !fid) return;
    const params = new URLSearchParams({ fid, runId: option.runId, provider: option.provider, locationKey: option.locationKey });
    router.replace(`/ai-seo/prompt-research/?${params.toString()}`, { scroll: false });
  };

  const monitoredSet = useMemo(() => new Set(promptRows.map((row) => normalize(row.prompt))), [promptRows]);
  const generatedRows = useMemo<PromptResearchPromptRow[]>(() => (generated?.ideas ?? []).map((idea) => ({
    id: idea.id, prompt: idea.prompt, topic: idea.topic, intent: idea.intent, relevance: idea.relevance,
    monitored: monitoredSet.has(normalize(idea.prompt)), observed: false, responseCount: 0,
    brandNames: [], sourceDomains: [], observationIds: [], capturedAt: null,
  })), [generated, monitoredSet]);
  const combinedPrompts = useMemo(() => {
    const rows = [...(data?.research.prompts ?? [])];
    const seen = new Set(rows.map((row) => normalize(row.prompt)));
    for (const row of generatedRows) if (!seen.has(normalize(row.prompt))) rows.push(row);
    return rows;
  }, [data?.research.prompts, generatedRows]);
  const combinedTopics = useMemo(() => {
    const byLabel = new Map((data?.research.topics ?? []).map((row) => [normalize(row.label), { ...row, intents: { ...row.intents }, brandNames: [...row.brandNames], sourceDomains: [...row.sourceDomains] }]));
    for (const idea of generated?.ideas ?? []) {
      if (monitoredSet.has(normalize(idea.prompt))) continue;
      const key = normalize(idea.topic);
      const row = byLabel.get(key) ?? { id: `generated_${idea.id}`, label: idea.topic, promptCount: 0, monitoredCount: 0, observedAnswers: 0, relevance: idea.relevance, intents: { informational: 0, exploratory: 0, commercial: 0, transactional: 0 }, brandNames: [], sourceDomains: [] } satisfies PromptResearchTopicRow;
      row.promptCount += 1; row.monitoredCount += monitoredSet.has(normalize(idea.prompt)) ? 1 : 0; row.intents[idea.intent] += 1;
      if (idea.relevance === "high" || (idea.relevance === "medium" && row.relevance === "low")) row.relevance = idea.relevance;
      byLabel.set(key, row);
    }
    return [...byLabel.values()];
  }, [data?.research.topics, generated?.ideas, monitoredSet]);
  const exportCsv = () => {
    const values = combinedPrompts.map((row) => [row.topic, row.prompt, INTENT_LABELS[row.intent], RELEVANCE_LABELS[row.relevance], row.monitored ? "모니터링" : "후보", row.observed ? "실측" : "미수집"]);
    const csv = [["주제", "프롬프트", "의도", "관련성", "상태", "관측"], ...values].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = `prompt-research-${fid}.csv`; anchor.click(); URL.revokeObjectURL(href);
  };

  if (loading && !data && projects.length === 0) return <div className="flex min-h-[600px] items-center justify-center bg-[#f4f5f7] text-[12px] text-[#7d848e]">프롬프트 리서치를 불러오는 중…</div>;
  if (!fid) return <Onboarding projects={projects} onOpen={navigate} />;
  if (data?.state === "unconfigured" && settings) return <div className="min-h-[calc(100dvh-64px)] bg-[#f4f5f7] p-5"><div className="mx-auto max-w-[1200px]"><AiVisibilitySettingsPanel settings={settings} onSaved={load} /></div></div>;

  const summary = data?.research.summary;
  const tabCounts: Record<ResearchTab, number> = { topics: combinedTopics.length, prompts: combinedPrompts.length, brands: data?.research.brands.length ?? 0, sources: data?.research.sources.length ?? 0 };
  const currentRunKey = data?.filters.selected.runId && data.filters.selected.provider && data.filters.selected.locationKey ? `${data.filters.selected.runId}:${data.filters.selected.provider}:${data.filters.selected.locationKey}` : "";

  return <div className="min-h-[calc(100dvh-64px)] bg-[#f4f5f7] text-[#2d3239]"><div className="mx-auto w-full max-w-[1540px] px-3 py-4 sm:px-5 lg:px-6"><header><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-[9px] text-[#8a9099]"><span>홈</span><span>›</span><span>AI 가시성</span><span>›</span><b className="font-medium text-[#59606a]">프롬프트 리서치</b></div><h1 className="mt-2 text-[18px] font-semibold tracking-[-0.02em]">프롬프트 리서치: <span className="text-[#555bcf]">{data?.scope.brandName}</span></h1></div><div className="flex flex-wrap gap-2"><select value={fid} onChange={(event) => navigate(event.target.value)} className="h-9 min-w-[205px] rounded-[5px] border border-[#d6dae0] bg-white px-3 text-[10px]">{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.domain}</option>)}</select><button className={BUTTON} onClick={() => setShowSetup((value) => !value)}><GearIcon /> 설정</button><button className={BUTTON} disabled={!promptRows.length || run?.status === "queued" || run?.status === "running"} onClick={() => void startRun()}><ReloadIcon /> {run?.status === "queued" || run?.status === "running" ? "수집 중" : "지금 수집"}</button></div></div><form className="mt-4 flex max-w-[760px]" onSubmit={(event) => { event.preventDefault(); void runResearch(); }}><input value={seed} onChange={(event) => setSeed(event.target.value)} aria-label="프롬프트 조사 주제" placeholder="예: 기업 인수 합병" className="h-10 min-w-0 flex-1 rounded-l-[5px] border border-r-0 border-[#cfd4da] bg-white px-3 text-[12px] outline-none focus:border-[#6768d9]" /><button className={`${PRIMARY} h-10 rounded-l-none px-4`} disabled={researching || seed.trim().length < 2} aria-label="프롬프트 조사 시작"><MagnifyingGlassIcon /> {researching ? "조사 중…" : "조사"}</button></form><div className="mt-3 flex flex-wrap items-center gap-2"><select className="h-8 rounded-[5px] border border-[#d7dbe1] bg-white px-2 text-[9px]" value={currentRunKey} disabled={!data?.filters.runs.length} onChange={(event) => updateRun(event.target.value)}>{data?.filters.runs.map((row) => <option key={`${row.runId}:${row.provider}:${row.locationKey}`} value={`${row.runId}:${row.provider}:${row.locationKey}`}>{row.countryCode} · {PROVIDER_LABELS[row.provider]} · {formatDate(row.capturedAt)}</option>)}</select><span className="text-[9px] text-[#8b919a]">{generated ? `${generated.provenance.provider}/${generated.provenance.model} 생성 후보 · ${formatDate(generated.generatedAt)}` : data?.provenance.generatedAt ? `${data.provenance.source} · ${formatDate(data.provenance.generatedAt)}` : "실제 수집 데이터 기준"}</span></div></header>

  {error && <div role="alert" className="mt-3 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
  {showSetup && settings && <div className="mt-3"><AiVisibilitySettingsPanel settings={settings} onSaved={load} /></div>}
  {showSetup && settings?.project && <div className="mt-3"><AiVisibilityPromptManager fid={fid} prompts={promptRows} limit={settings.limits.prompts} onChanged={load} /></div>}
  {run && (run.status === "queued" || run.status === "running") && <div role="status" aria-live="polite" className="mt-3 rounded-[6px] border border-[#cfd0f8] bg-[#f0f0ff] px-3 py-2 text-[10px] text-[#5e5d7b]">AI 응답 수집 중 · {run.processed}/{run.total}{run.currentPrompt && ` · ${run.currentPrompt}`}</div>}

  {loading && !data ? <div className="mt-4"><LoadingState /></div> : data && <><section className={`${CARD} mt-4 grid sm:grid-cols-5`}><Metric label="관련 주제 AI 검색량" value="n/a" note="신뢰 가능한 볼륨 원천 없음" /><Metric label="주제" value={`${combinedTopics.length}개`} note={`모니터링 ${summary?.topics ?? 0} · 생성 후보 포함`} /><Metric label="프롬프트" value={`${combinedPrompts.length}개`} note={`모니터링 ${promptRows.length}개`} /><Metric label="언급된 브랜드" value={`${summary?.mentionedBrands ?? 0}개`} note={(data.research.brands.slice(0, 3).map((row) => row.label).join(", ")) || "응답 분석 후 표시"} /><Metric label="소스 도메인" value={`${summary?.sourceDomains ?? 0}개`} note={(data.research.sources.slice(0, 3).map((row) => row.label).join(", ")) || "실제 인용 URL 없음"} /></section>

  {showSurvey && <section className="mt-3 flex items-center gap-3 rounded-[7px] border border-[#b9c8fa] bg-[#edf2ff] px-4 py-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#dbe5ff] text-[#5664d8]"><StarFilledIcon /></span><p className="min-w-0 flex-1 text-[10px] text-[#525a66]">새로운 프롬프트 리서치 결과가 얼마나 유용한가요?</p><div className="flex">{[1, 2, 3, 4, 5].map((item) => <button key={item} aria-label={`${item}점`} className="p-1 text-[#8d96a3]" onClick={() => setRating(item)}>{item <= rating ? <StarFilledIcon /> : <StarIcon />}</button>)}</div><button aria-label="평가 배너 닫기" className="ml-auto text-[#7f8792]" onClick={() => setShowSurvey(false)}><Cross2Icon /></button></section>}

  <section className={`${CARD} mt-3 overflow-hidden`}><div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1e4e8] px-4 py-3"><div><h2 className="text-[13px] font-semibold text-[#343a42]">리서치 결과 <span className="font-normal text-[#8b9199]">1–{Math.min(10, tabCounts[tab])} ({tabCounts[tab]})</span></h2>{generated && <p className="mt-0.5 text-[9px] text-[#8d939c]">“{generated.seed}”에서 생성된 후보는 모니터링 전까지 실제 관측값과 분리됩니다.</p>}</div><button className={BUTTON} onClick={exportCsv}><DownloadIcon /> 내보내기</button></div><div className="flex flex-wrap items-center gap-2 border-b border-[#e8eaed] px-4 py-3">{(["topics", "prompts", "brands", "sources"] as ResearchTab[]).map((item) => <button key={item} className={`h-8 rounded-[4px] border px-3 text-[10px] ${tab === item ? "border-[#7577e8] bg-[#f1f1ff] font-semibold text-[#4f53bd]" : "border-[#dfe2e6] bg-white text-[#68707a]"}`} onClick={() => setTab(item)}>{item === "topics" ? "주제" : item === "prompts" ? "프롬프트" : item === "brands" ? "브랜드" : "소스 도메인"} <span className="text-[#999fa8]">{tabCounts[item]}</span></button>)}<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="결과 필터링" className="h-8 min-w-[180px] flex-1 rounded-[4px] border border-[#d9dde2] px-3 text-[10px] outline-none focus:border-[#7475e4]" />{(tab === "prompts" || tab === "topics") && <select value={intent} onChange={(event) => setIntent(event.target.value as "all" | PromptResearchIntent)} className="h-8 rounded-[4px] border border-[#d9dde2] bg-white px-2 text-[10px]"><option value="all">전체 의도</option>{(Object.keys(INTENT_LABELS) as PromptResearchIntent[]).map((item) => <option key={item} value={item}>{INTENT_LABELS[item]}</option>)}</select>}</div><div className="hidden grid-cols-[minmax(0,1fr)_88px_105px_120px_105px] gap-3 border-b border-[#e7e9ed] bg-[#f7f8f9] px-5 py-2 text-[9px] font-medium text-[#747b85] md:grid"><span>{tab === "topics" ? "주제" : tab === "prompts" ? "프롬프트" : tab === "brands" ? "브랜드" : "소스 도메인"}</span><span>관련성</span><span>{tab === "topics" ? "모니터링" : "의도"}</span><span>{tab === "topics" ? "의도 분포" : "관측 상태"}</span><span>{tab === "topics" ? "브랜드" : "모니터링"}</span></div><DataTable tab={tab} prompts={combinedPrompts} topics={combinedTopics} brands={data.research.brands} sources={data.research.sources} filter={filter} intent={intent} expanded={expanded} onExpanded={setExpanded} onMonitor={(row) => void monitor(row)} busyId={busyId} /></section><div className="mt-3 rounded-[6px] border border-[#e0e3e7] bg-white px-3 py-2 text-[9px] leading-4 text-[#818892]">생성 후보는 AI가 조사 주제에서 만든 질문 아이디어입니다. ‘모니터링’을 누른 뒤 실제 AI 응답 수집을 실행해야 언급 브랜드·출처·관측 상태가 채워집니다.</div></>}
  </div></div>;
}
