import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import {
  SeoLiveAnalysisDashboard,
  type SeoLiveAnalysisData,
} from "@/components/seo-tools/SeoLiveAnalysisDashboard";
import { db } from "@/db/client";
import { folders } from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { getAuth } from "@/lib/session";
import { getDomainAnalytics } from "@/server/analytics";
import { getSeoProjectSettings } from "@/server/seo-projects/settings";

export const dynamic = "force-dynamic";

export default async function BacklinkAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; domain?: string }>;
}) {
  const query = await searchParams;
  const auth = await getAuth();
  if (!auth) redirect("/");

  const projects = await db
    .select({ id: folders.id, name: folders.name, domain: folders.domain })
    .from(folders)
    .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)));
  const requestedDomain = query.domain ? normalizeDomain(query.domain) : "";
  const project =
    projects.find((row) => row.id === query.project) ??
    projects.find((row) => normalizeDomain(row.domain) === requestedDomain) ??
    projects[0];
  if (!project) redirect("/home/");

  const domain = normalizeDomain(project.domain);
  const settings = await getSeoProjectSettings(auth, project.id);
  const report = await getDomainAnalytics({
    domain,
    countryCode: settings.countryCode,
    device: settings.device,
  });
  const linkSource = report?.sources.find((source) => source.key === "link_graph");
  const data: SeoLiveAnalysisData = {
    title: { ko: "백링크 감사", en: "Backlink Audit" },
    description: {
      ko: "연결된 인바운드 링크 원천에서 참조 도메인과 링크 품질을 검사합니다. 독성 점수는 근거 데이터가 있을 때만 제공합니다.",
      en: "Audits referring domains and link quality from a connected inbound-link source. Toxicity is shown only when supporting evidence exists.",
    },
    domain,
    projectId: project.id,
    countryCode: settings.countryCode,
    device: settings.device,
    sourceUpdatedAt: linkSource?.lastUpdated ?? null,
    sourceRecords: linkSource?.records ?? 0,
    metrics: [
      { label: { ko: "백링크", en: "Backlinks" }, value: report?.metrics.backlinks ?? null },
      {
        label: { ko: "참조 도메인", en: "Referring domains" },
        value: report?.metrics.referringDomains ?? null,
      },
      { label: { ko: "감사한 링크", en: "Audited links" }, value: null },
      { label: { ko: "유해 링크", en: "Toxic links" }, value: null },
    ],
    columns: [
      { key: "referringDomain", label: { ko: "참조 도메인", en: "Referring domain" } },
      { key: "sourceUrl", label: { ko: "소스 URL", en: "Source URL" } },
      { key: "targetUrl", label: { ko: "대상 URL", en: "Target URL" } },
      { key: "toxicity", label: { ko: "독성 근거", en: "Toxicity evidence" } },
    ],
    rows: [],
    empty: {
      ko: "라이브 인바운드 링크 및 독성 근거 원천이 연결되지 않았습니다",
      en: "No live inbound-link or toxicity-evidence source is connected",
    },
  };

  return (
    <AppShell
      activeToolkit="seo"
      activeHref="/backlink_audit/"
      projectContext={{
        label: project.name,
        href: `/seo/?project=${encodeURIComponent(project.id)}`,
        projectId: project.id,
      }}
    >
      <SeoLiveAnalysisDashboard data={data} />
    </AppShell>
  );
}
