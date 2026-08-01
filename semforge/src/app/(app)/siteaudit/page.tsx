import { and, desc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import {
  SiteAuditDashboard,
  type SiteAuditCampaignRow,
} from "@/components/siteaudit/SiteAuditDashboard";
import { SiteAuditProjectList } from "@/components/siteaudit/SiteAuditProjectList";
import { db } from "@/db/client";
import { siteAuditCampaigns } from "@/db/schema";
import { pageSession } from "@/server/page-auth";
import { listSiteAuditProjects } from "@/server/siteaudit/projects";

export const dynamic = "force-dynamic";

export default async function SiteAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    campaign?: string;
    q?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const requestedCampaignId = params.campaign;
  const { auth, capabilities } = await pageSession();

  if (requestedCampaignId) {
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
          eq(siteAuditCampaigns.id, requestedCampaignId),
          eq(siteAuditCampaigns.workspaceId, auth.workspaceId),
          isNull(siteAuditCampaigns.deletedAt)
        )
      )
      .orderBy(desc(siteAuditCampaigns.updatedAt));

    if (rows.length > 0) {
      const campaigns: SiteAuditCampaignRow[] = rows.map((row) => ({
        ...row,
        lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
      }));
      return (
        <AppShell activeToolkit="seo" activeHref="/siteaudit/">
          <SiteAuditDashboard
            campaigns={campaigns}
            canManage={Boolean(capabilities.create)}
            initialCampaignId={requestedCampaignId}
          />
        </AppShell>
      );
    }
  }

  const projectList = await listSiteAuditProjects(auth, {
    q: params.q,
    page: Number(params.page) || 1,
    pageSize: Number(params.pageSize) || 10,
    sort: params.sort,
  });

  return (
    <AppShell activeToolkit="seo" activeHref="/siteaudit/">
      <SiteAuditProjectList
        initialRows={projectList.rows}
        initialMeta={projectList.meta}
        canManage={Boolean(capabilities.create)}
      />
    </AppShell>
  );
}
