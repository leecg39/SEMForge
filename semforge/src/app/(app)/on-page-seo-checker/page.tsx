import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { OnPageCheckerDashboard } from "@/components/onpage/OnPageCheckerDashboard";
import { db } from "@/db/client";
import { folders } from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { getAuth } from "@/lib/session";
import { getSeoProjectSettings } from "@/server/seo-projects/settings";

export const dynamic = "force-dynamic";

/** TalorData SERP와 Firecrawl 페이지 분석을 현재 SEO 프로젝트에 미리 연결한다. */
export default async function OnPageSeoCheckerPage({
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
  return (
    <AppShell
      activeToolkit="seo"
      activeHref="/on-page-seo-checker/"
      projectContext={{
        label: project.name,
        href: `/seo/?project=${encodeURIComponent(project.id)}`,
        projectId: project.id,
      }}
    >
      <OnPageCheckerDashboard
        initialUrl={`https://${domain}/`}
        initialCountry={settings.countryCode}
        initialDevice={settings.device}
      />
    </AppShell>
  );
}
