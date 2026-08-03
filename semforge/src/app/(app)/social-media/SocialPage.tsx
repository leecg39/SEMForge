import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import {
  SocialToolkit,
  type SocialMode,
} from "@/components/social/SocialToolkit";
import { hasRole } from "@/lib/rbac";
import { pageSession } from "@/server/page-auth";
import {
  listSocialProjects,
  requireOwnedSocialFolder,
  resolveDefaultSocialFolder,
} from "@/server/social/projects";

const HREF: Record<SocialMode, string> = {
  dashboard: "/social-media/",
  poster: "/social-media/poster/",
  tracker: "/social-media/tracker/",
  "content-insights": "/social-media/content-insights/",
  analytics: "/social-media/analytics/",
};

function ProjectSelection({
  projects,
  requested,
}: {
  projects: Awaited<ReturnType<typeof listSocialProjects>>;
  requested: string;
}) {
  return (
    <div className="min-h-[calc(100dvh-64px)] bg-[#f5f6f7] p-6">
      <div className="mx-auto max-w-3xl rounded-xl border border-[#e3e5e9] bg-white p-8 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#6b65d9]">
          프로젝트 선택
        </p>
        <h1 className="mt-2 text-[22px] font-semibold">
          소셜 툴킷 프로젝트를 선택하세요
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-[#707680]">
          {requested
            ? `요청한 프로젝트(${requested})가 없거나 현재 워크스페이스에 속하지 않습니다.`
            : "소셜 게시·분석은 기존 프로젝트에 귀속됩니다."}
        </p>
        <div className="mt-5 grid gap-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/social-media/?fid=${encodeURIComponent(project.id)}`}
              className="flex items-center justify-between rounded-lg border border-[#e0e2e7] px-4 py-3 text-[13px] hover:border-[#8884e8] hover:bg-[#f8f8ff]"
            >
              <span>
                <b className="font-semibold">{project.name}</b>
                <span className="ml-2 text-[#7b818b]">{project.domain}</span>
              </span>
              <span className="text-[11px] font-semibold text-[#5c5bdd]">
                {project.configured ? "대시보드 열기" : "설정 시작"}
              </span>
            </Link>
          ))}
          {projects.length === 0 && (
            <Link
              href="/home/"
              className="text-[13px] font-semibold text-[#315be8]"
            >
              홈에서 프로젝트 만들기
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export async function SocialPage({
  mode,
  search,
}: {
  mode: SocialMode;
  search: Record<string, string | string[] | undefined>;
}) {
  const { auth, capabilities } = await pageSession();
  const requested = typeof search.fid === "string" ? search.fid.trim() : "";
  const fid = requested || (await resolveDefaultSocialFolder(auth)) || "";
  if (!fid) {
    const projects = await listSocialProjects(auth);
    return (
      <AppShell activeToolkit="social" activeHref={HREF[mode]}>
        <ProjectSelection projects={projects} requested="" />
      </AppShell>
    );
  }
  try {
    await requireOwnedSocialFolder(auth, fid);
  } catch {
    const projects = await listSocialProjects(auth);
    return (
      <AppShell activeToolkit="social" activeHref={HREF[mode]}>
        <ProjectSelection projects={projects} requested={requested} />
      </AppShell>
    );
  }
  if (!requested) redirect(`${HREF[mode]}?fid=${encodeURIComponent(fid)}`);
  return (
    <AppShell activeToolkit="social" activeHref={HREF[mode]}>
      <SocialToolkit
        fid={fid}
        mode={mode}
        canEdit={Boolean(capabilities.create)}
        canApprove={hasRole(auth.role, "admin")}
      />
    </AppShell>
  );
}
