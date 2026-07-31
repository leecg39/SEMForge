import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { OrganicResearchDashboard } from "@/components/analytics/OrganicResearchDashboard";
import { AppShell } from "@/components/app/AppShell";
import { db } from "@/db/client";
import { folders } from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { getAuth } from "@/lib/session";
import { getDomainAnalytics } from "@/server/analytics";
import { getSeoProjectSettings } from "@/server/seo-projects/settings";

export const dynamic = "force-dynamic";

/** 축적된 실제 SERP 스냅샷을 현재 SEO 프로젝트 조건으로 조회한다. */
export default async function OrganicResearchPage({
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
  const initialReport = await getDomainAnalytics({
    domain,
    countryCode: settings.countryCode,
    device: settings.device,
  });

  return (
    <AppShell
      activeToolkit="seo"
      activeHref="/analytics/organic/overview"
      projectContext={{
        label: project.name,
        href: `/seo/?project=${encodeURIComponent(project.id)}`,
        projectId: project.id,
      }}
    >
      <OrganicResearchDashboard
        initialReport={initialReport}
        initialDomain={domain}
        initialCountry={settings.countryCode}
        initialDevice={settings.device}
      />
    </AppShell>
  );
}
