import { and, desc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import {
  PositionTrackingDashboard,
  type CampaignSummary,
} from "@/components/position-tracking/PositionTrackingDashboard";
import { PositionTrackingLanding } from "@/components/position-tracking/PositionTrackingLanding";
import { db } from "@/db/client";
import { positionTrackingCampaigns } from "@/db/schema";
import { pageSession } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default async function PositionTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string | string[] }>;
}) {
  const { auth, capabilities } = await pageSession();
  const query = await searchParams;
  const requestedCampaignId = Array.isArray(query.campaign)
    ? query.campaign[0]
    : query.campaign;

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

  const selectedCampaign = requestedCampaignId
    ? campaigns.find((campaign) => campaign.id === requestedCampaignId)
    : null;
  const orderedCampaigns = selectedCampaign
    ? [selectedCampaign, ...campaigns.filter((campaign) => campaign.id !== selectedCampaign.id)]
    : campaigns;

  return (
    <AppShell activeToolkit="seo" activeHref="/position-tracking/">
      {selectedCampaign ? (
        <PositionTrackingDashboard
          campaigns={orderedCampaigns}
          canCollect={Boolean(capabilities.create)}
        />
      ) : (
        <PositionTrackingLanding
          campaigns={campaigns}
          canCreate={Boolean(capabilities.create)}
        />
      )}
    </AppShell>
  );
}
