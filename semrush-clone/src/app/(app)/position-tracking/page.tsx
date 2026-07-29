import { and, desc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import {
  PositionTrackingDashboard,
  type CampaignSummary,
} from "@/components/position-tracking/PositionTrackingDashboard";
import { db } from "@/db/client";
import { positionTrackingCampaigns } from "@/db/schema";
import { pageSession } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default async function PositionTrackingPage() {
  const { auth, capabilities } = await pageSession();

  const campaigns: CampaignSummary[] = await db
    .select({
      id: positionTrackingCampaigns.id,
      name: positionTrackingCampaigns.name,
      domain: positionTrackingCampaigns.domain,
      location: positionTrackingCampaigns.location,
      device: positionTrackingCampaigns.device,
      searchEngine: positionTrackingCampaigns.searchEngine,
      status: positionTrackingCampaigns.status,
      visibility: positionTrackingCampaigns.visibility,
    })
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        isNull(positionTrackingCampaigns.deletedAt)
      )
    )
    .orderBy(desc(positionTrackingCampaigns.updatedAt));

  return (
    <AppShell activeToolkit="seo" activeHref="/position-tracking/">
      <PositionTrackingDashboard
        campaigns={campaigns}
        canCollect={Boolean(capabilities.create)}
      />
    </AppShell>
  );
}
