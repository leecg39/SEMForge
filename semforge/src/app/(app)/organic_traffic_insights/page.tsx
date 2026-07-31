import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { OrganicTrafficInsightsDashboard } from "@/components/seo-tools/OrganicTrafficInsightsDashboard";
import { db } from "@/db/client";
import { folders } from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { getAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OrganicTrafficInsightsPage({
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
  return (
    <AppShell
      activeToolkit="seo"
      activeHref="/organic_traffic_insights/"
      projectContext={{
        label: project.name,
        href: `/seo/?project=${encodeURIComponent(project.id)}`,
        projectId: project.id,
      }}
    >
      <OrganicTrafficInsightsDashboard domain={domain} />
    </AppShell>
  );
}
