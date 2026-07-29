import { and, desc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import {
  SiteAuditDashboard,
  type SiteAuditCampaignRow,
} from "@/components/siteaudit/SiteAuditDashboard";
import { db } from "@/db/client";
import { siteAuditCampaigns } from "@/db/schema";
import { pageSession } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default async function SiteAuditPage() {
  const { auth, capabilities } = await pageSession();

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

  return (
    <AppShell activeToolkit="seo" activeHref="/siteaudit/">
      <SiteAuditDashboard campaigns={campaigns} canManage={Boolean(capabilities.create)} />
    </AppShell>
  );
}
