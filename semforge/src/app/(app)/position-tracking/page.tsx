import { and, desc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import {
  PositionTrackingDashboard,
  type CampaignSummary,
} from "@/components/position-tracking/PositionTrackingDashboard";
import { PositionTrackingLanding } from "@/components/position-tracking/PositionTrackingLanding";
import { db } from "@/db/client";
import { folders, positionTrackingCampaigns } from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { pageSession } from "@/server/page-auth";
import { getSeoProjectSettings } from "@/server/seo-projects/settings";

export const dynamic = "force-dynamic";

export default async function PositionTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{
    campaign?: string | string[];
    project?: string | string[];
    domain?: string | string[];
  }>;
}) {
  const { auth, capabilities } = await pageSession();
  const query = await searchParams;
  const requestedCampaignId = Array.isArray(query.campaign)
    ? query.campaign[0]
    : query.campaign;
  const requestedProjectId = Array.isArray(query.project) ? query.project[0] : query.project;
  const requestedDomainValue = Array.isArray(query.domain) ? query.domain[0] : query.domain;
  const projects = await db
    .select({ id: folders.id, name: folders.name, domain: folders.domain })
    .from(folders)
    .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)));
  const requestedDomain = requestedDomainValue ? normalizeDomain(requestedDomainValue) : "";
  const project =
    projects.find((row) => row.id === requestedProjectId) ??
    projects.find((row) => normalizeDomain(row.domain) === requestedDomain) ??
    projects[0];
  const settings = project ? await getSeoProjectSettings(auth, project.id) : null;

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

  const selectedCampaign =
    (requestedCampaignId
      ? campaigns.find((campaign) => campaign.id === requestedCampaignId)
      : null) ??
    (project
      ? campaigns.find(
          (campaign) => normalizeDomain(campaign.domain) === normalizeDomain(project.domain),
        )
      : null);
  const orderedCampaigns = selectedCampaign
    ? [selectedCampaign, ...campaigns.filter((campaign) => campaign.id !== selectedCampaign.id)]
    : campaigns;

  return (
    <AppShell
      activeToolkit="seo"
      activeHref="/position-tracking/"
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
      {selectedCampaign ? (
        <PositionTrackingDashboard
          campaigns={orderedCampaigns}
          canCollect={Boolean(capabilities.create)}
        />
      ) : (
        <PositionTrackingLanding
          campaigns={campaigns}
          canCreate={Boolean(capabilities.create)}
          initialDomain={project ? normalizeDomain(project.domain) : ""}
          initialLocation={settings?.countryCode ?? "US"}
          initialDevice={settings?.device ?? "desktop"}
          initialSearchEngine={settings?.searchEngine ?? "google"}
        />
      )}
    </AppShell>
  );
}
