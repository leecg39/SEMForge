import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { AiVisibilityDashboard } from "@/components/ai-visibility/AiVisibilityDashboard";
import { BrandPerformanceDashboard } from "@/components/ai-visibility/BrandPerformanceDashboard";
import { CompetitorResearchDashboard } from "@/components/ai-visibility/CompetitorResearchDashboard";
import { PromptResearchDashboard } from "@/components/ai-visibility/PromptResearchDashboard";
import { getAuth } from "@/lib/session";
import { pageSession } from "@/server/page-auth";
import {
  findOwnedAiFolder,
  listAiVisibilityFolders,
  resolveAiVisibilityFolderByDomain,
  resolveDefaultAiVisibilityFolder,
} from "@/server/ai-visibility/projects";

const slugs = [
  "overview",
  "competitor-research",
  "prompt-research",
  "brand-performance",
  "perception",
  "narrative-drivers",
  "questions",
  "growth-plan",
] as const;

type Slug = (typeof slugs)[number];

const pendingToolInfo: Record<Exclude<Slug, "overview">, { title: string; reason: string }> = {
  "competitor-research": {
    title: "Competitor Research",
    reason: "경쟁사의 AI 플랫폼 노출을 비교하려면 ChatGPT/Gemini/Perplexity 등 플랫폼별 프롬프트 패널 데이터가 필요합니다. 현재 연결된 소스(TalorData SERP)는 Google AI 개요만 관측할 수 있어, 가짜 비교 수치를 만들지 않고 준비 중으로 표시합니다.",
  },
  "prompt-research": {
    title: "Prompt Research",
    reason: "AI 플랫폼 프롬프트 볼륨/주제 데이터는 연결된 무료 소스로 수집할 수 없습니다. Google AI 개요 관측은 개요(Overview) 화면에서 제공합니다.",
  },
  "brand-performance": {
    title: "Brand Performance",
    reason: "LLM 답변 속 브랜드 인식/감정 분석은 LLM 질의 파이프라인이 필요합니다. 현재 소스로는 정직한 수치를 제공할 수 없어 준비 중입니다.",
  },
  perception: {
    title: "Perception",
    reason: "브랜드 인식/감정 분석은 LLM 응답 수집 소스가 필요합니다. 연결된 소스가 확정되면 실데이터로 제공합니다.",
  },
  "narrative-drivers": {
    title: "Narrative Drivers",
    reason: "내러티브 요인 분석은 LLM 응답 수집 소스가 필요합니다. 현재 소스로는 제공할 수 없습니다.",
  },
  questions: {
    title: "Questions",
    reason: "사용자 질문 데이터는 연결된 무료 소스에 없습니다. Google 연관 질문(People Also Ask) 기반으로 확장하는 방안을 검토 중입니다.",
  },
  "growth-plan": {
    title: "Growth Actions",
    reason: "성장 액션 추천은 위 도구들의 실데이터가 먼저 확보되어야 정직하게 동작합니다.",
  },
};

export function generateStaticParams() {
  return slugs.map((slug) => ({ slug }));
}

function PendingTool({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">AI Visibility</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-900">{title}</h1>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
          데이터 소스 준비 중
        </span>
        <p className="mt-4 text-sm leading-6 text-zinc-600">{reason}</p>
        <p className="mt-3 text-xs text-zinc-400">
          SEMForge는 연결된 실제 데이터 소스가 없는 지표를 가짜 숫자로 채우지 않습니다.
        </p>
      </div>
    </div>
  );
}

function canonicalOverviewSearch(
  search: Record<string, string | string[] | undefined>,
  fid: string,
) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (key === "domain" || key === "fid" || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else next.set(key, value);
  }
  next.set("fid", fid);
  if (!new Set(["1m", "6m", "all"]).has(next.get("range") ?? "")) next.set("range", "1m");
  if (!new Set(["top_topics", "topic_opportunities", "cited_sources", "source_opportunities", "cited_pages"]).has(next.get("tab") ?? "")) {
    next.set("tab", "top_topics");
  }
  const page = Number(next.get("page"));
  if (!Number.isInteger(page) || page < 1) next.set("page", "1");
  return next;
}

function ProjectSelection({
  projects,
  requestedFid,
}: {
  projects: Awaited<ReturnType<typeof listAiVisibilityFolders>>;
  requestedFid: string;
}) {
  return (
    <div className="min-h-[calc(100dvh-56px)] bg-[#f5f6f7] p-6">
      <div className="mx-auto max-w-3xl rounded-[10px] border border-[#e4e6eb] bg-white p-8 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7770d8]">프로젝트 선택</p>
        <h1 className="mt-2 text-[22px] font-semibold text-[#252930]">이 프로젝트의 가시성 개요를 열 수 없습니다</h1>
        <p className="mt-2 text-[13px] leading-6 text-[#666d78]">
          요청한 프로젝트{requestedFid ? ` (${requestedFid})` : ""}가 없거나 현재 워크스페이스에 속하지 않습니다. 접근 가능한 프로젝트를 선택해 주세요.
        </p>
        <div className="mt-5 grid gap-2">
          {projects.map((project) => (
            <a
              key={project.id}
              href={`/ai-seo/overview/?fid=${encodeURIComponent(project.id)}&range=1m&tab=top_topics&page=1`}
              className="flex items-center justify-between rounded-[8px] border border-[#e0e2e7] px-4 py-3 text-[13px] hover:border-[#8884e8] hover:bg-[#f8f8ff]"
            >
              <span><b className="font-semibold text-[#333841]">{project.name}</b><span className="ml-2 text-[#7b818b]">{project.domain}</span></span>
              <span className="text-[11px] font-medium text-[#5c5bdd]">{project.configured ? "개요 열기" : "설정 시작"}</span>
            </a>
          ))}
          {projects.length === 0 && <a href="/projects/" className="mt-2 text-[13px] font-semibold text-[#315be8] hover:underline">프로젝트 만들기</a>}
        </div>
      </div>
    </div>
  );
}

export default async function AiSeoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const { domain, fid } = search;
  const href = `/ai-seo/${slug}/`;

  if (!slugs.includes(slug as Slug)) notFound();

  if (slug === "overview") {
    const { auth } = await pageSession();
    const requestedFid = typeof fid === "string" ? fid.trim() : "";
    const requestedDomain = typeof domain === "string" ? domain.trim() : "";
    let resolvedFid = requestedFid;
    if (!resolvedFid && requestedDomain) {
      resolvedFid = await resolveAiVisibilityFolderByDomain(auth, requestedDomain) ?? "";
      if (!resolvedFid) {
        const projects = await listAiVisibilityFolders(auth);
        return (
          <AppShell activeToolkit="ai" activeHref={href}>
            <ProjectSelection projects={projects} requestedFid={`domain=${requestedDomain}`} />
          </AppShell>
        );
      }
    }
    if (!resolvedFid) resolvedFid = await resolveDefaultAiVisibilityFolder(auth) ?? "";

    if (requestedFid && !await findOwnedAiFolder(auth, requestedFid)) {
      const projects = await listAiVisibilityFolders(auth);
      return (
        <AppShell activeToolkit="ai" activeHref={href}>
          <ProjectSelection projects={projects} requestedFid={requestedFid} />
        </AppShell>
      );
    }

    const canonical = resolvedFid ? canonicalOverviewSearch(search, resolvedFid) : null;
    if (resolvedFid && canonical) {
      const currentRange = typeof search.range === "string" ? search.range : "";
      const currentTab = typeof search.tab === "string" ? search.tab : "";
      const currentPage = typeof search.page === "string" ? search.page : "";
      if (
        requestedFid !== resolvedFid
        || typeof domain === "string"
        || currentRange !== canonical.get("range")
        || currentTab !== canonical.get("tab")
        || currentPage !== canonical.get("page")
      ) {
        redirect(`/ai-seo/overview/?${canonical.toString()}`);
      }
    }

    return (
      <AppShell activeToolkit="ai" activeHref={href}>
        <AiVisibilityDashboard key={canonical?.toString() ?? "empty"} initialFolderId={resolvedFid} />
      </AppShell>
    );
  }

  if (slug === "brand-performance") {
    const initialFolderId = typeof fid === "string" ? fid : "";
    let auth = null;
    if (!initialFolderId && typeof domain === "string") {
      auth = await getAuth();
      const resolved = auth ? await resolveAiVisibilityFolderByDomain(auth, domain) : null;
      if (resolved) {
        const next = new URLSearchParams();
        for (const [key, value] of Object.entries(search)) {
          if (key === "domain" || value === undefined) continue;
          if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
          else next.set(key, value);
        }
        next.set("fid", resolved);
        redirect(`/ai-seo/${slug}/?${next.toString()}`);
      }
    }
    return (
      <AppShell activeToolkit="ai" activeHref={href}>
        <BrandPerformanceDashboard initialFolderId={initialFolderId} />
      </AppShell>
    );
  }

  if (slug === "competitor-research") {
    const initialFolderId = typeof fid === "string" ? fid : "";
    if (!initialFolderId && typeof domain === "string") {
      const auth = await getAuth();
      const resolved = auth ? await resolveAiVisibilityFolderByDomain(auth, domain) : null;
      if (resolved) {
        const next = new URLSearchParams();
        for (const [key, value] of Object.entries(search)) {
          if (key === "domain" || value === undefined) continue;
          if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
          else next.set(key, value);
        }
        next.set("fid", resolved);
        redirect(`/ai-seo/${slug}/?${next.toString()}`);
      }
    }
    return (
      <AppShell activeToolkit="ai" activeHref={href}>
        <CompetitorResearchDashboard initialFolderId={initialFolderId} />
      </AppShell>
    );
  }

  if (slug === "prompt-research") {
    const initialFolderId = typeof fid === "string" ? fid : "";
    if (!initialFolderId && typeof domain === "string") {
      const auth = await getAuth();
      const resolved = auth ? await resolveAiVisibilityFolderByDomain(auth, domain) : null;
      if (resolved) redirect(`/ai-seo/${slug}/?fid=${encodeURIComponent(resolved)}`);
    }
    return (
      <AppShell activeToolkit="ai" activeHref={href}>
        <PromptResearchDashboard initialFolderId={initialFolderId} />
      </AppShell>
    );
  }

  const info = pendingToolInfo[slug as Exclude<Slug, "overview">];
  return (
    <AppShell activeToolkit="ai" activeHref={href}>
      <PendingTool title={info.title} reason={info.reason} />
    </AppShell>
  );
}
