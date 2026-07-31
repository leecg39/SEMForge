import { and, desc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import {
  SiteAuditDashboard,
  type SiteAuditCampaignRow,
} from "@/components/siteaudit/SiteAuditDashboard";
import { db } from "@/db/client";
import { folders, siteAuditCampaigns } from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { pageSession } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default async function SiteAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; project?: string; domain?: string }>;
}) {
  const query = await searchParams;
  const { campaign: requestedCampaignId } = query;
  const { auth, capabilities } = await pageSession();

  const projects = await db
    .select({ id: folders.id, name: folders.name, domain: folders.domain })
    .from(folders)
    .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)));
  const requestedDomain = query.domain ? normalizeDomain(query.domain) : "";
  const project =
    projects.find((row) => row.id === query.project) ??
    projects.find((row) => normalizeDomain(row.domain) === requestedDomain) ??
    projects[0];

  const rows = await db
    .select({
      id: siteAuditCampaigns.id,
      name: siteAuditCampaigns.name,
      domain: siteAuditCampaigns.domain,
      crawlScope: siteAuditCampaigns.crawlScope,
      pageLimit: siteAuditCampaigns.pageLimit,
      crawlSource: siteAuditCampaigns.crawlSource,
      schedule: siteAuditCampaigns.schedule,
      status: siteAuditCampaigns.status,
      siteHealth: siteAuditCampaigns.siteHealth,
      lastRunAt: siteAuditCampaigns.lastRunAt,
    })
    .from(siteAuditCampaigns)
    .where(
      and(
        eq(siteAuditCampaigns.workspaceId, auth.workspaceId),
        isNull(siteAuditCampaigns.deletedAt)
      )
    )
    .orderBy(desc(siteAuditCampaigns.updatedAt));

  const campaigns: SiteAuditCampaignRow[] = rows.map((row) => ({
    ...row,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
  }));
  const initialCampaignId = campaigns.some((campaign) => campaign.id === requestedCampaignId)
    ? requestedCampaignId
    : project
      ? campaigns.find(
          (campaign) => normalizeDomain(campaign.domain) === normalizeDomain(project.domain),
        )?.id
      : undefined;

  return (
    <AppShell
      activeToolkit="seo"
      activeHref="/siteaudit/"
      projectContext={
        project
          ? {
              label: project.name,
              href: `/seo/?project=${encodeURIComponent(project.id)}`,
              projectId: project.id,
            }
          : undefined
      }
    >
      <SiteAuditDashboard
        campaigns={campaigns}
        canManage={Boolean(capabilities.create)}
        initialCampaignId={initialCampaignId}
      />
    </AppShell>
  );
}
