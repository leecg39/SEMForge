import { and, desc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import {
  PositionTrackingDashboard,
  type CampaignSummary,
} from "@/components/position-tracking/PositionTrackingDashboard";
import { PositionTrackingLanding } from "@/components/position-tracking/PositionTrackingLanding";
import { PositionTrackingProjects } from "@/components/position-tracking/PositionTrackingProjects";
import { db } from "@/db/client";
import { positionTrackingCampaigns } from "@/db/schema";
import { getCampaignListSummary } from "@/server/position-tracking/overview";
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

  // 캠페인이 있으면 원본처럼 프로젝트 목록 테이블을, 없으면 소개 랜딩을 보여준다.
  const listItems = !selectedCampaign && campaigns.length > 0
    ? await getCampaignListSummary(auth)
    : null;

  return (
    <AppShell activeToolkit="seo" activeHref="/position-tracking/">
      {selectedCampaign ? (
        <PositionTrackingDashboard
          campaigns={orderedCampaigns}
          canCollect={Boolean(capabilities.create)}
        />
      ) : listItems ? (
        <PositionTrackingProjects
          items={listItems}
          canCreate={Boolean(capabilities.create)}
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
