import { and, desc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import {
  PositionTrackingDashboard,
  type CampaignSummary,
} from "@/components/position-tracking/PositionTrackingDashboard";
import { PositionTrackingLanding } from "@/components/position-tracking/PositionTrackingLanding";
import {
  PositionTrackingPendingTab,
  PositionTrackingTabs,
} from "@/components/position-tracking/PositionTrackingTabs";
import { resolveTab, toDashboardSection } from "@/components/position-tracking/tabs";
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
    tab?: string | string[];
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

  // 탭은 화면 안의 이동이므로 알 수 없는 값이 와도 404 대신 현황으로 되돌린다.
  const activeTab = resolveTab(Array.isArray(query.tab) ? query.tab[0] : query.tab);
  const tabBaseQuery: Record<string, string> = {};
  if (selectedCampaign) tabBaseQuery.campaign = selectedCampaign.id;
  if (project) tabBaseQuery.project = project.id;

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
        <>
          <PositionTrackingTabs activeSlug={activeTab.slug} baseQuery={tabBaseQuery} />
          {activeTab.status === "pending" ? (
            <PositionTrackingPendingTab label={activeTab.label} reason={activeTab.reason ?? ""} />
          ) : (
            <PositionTrackingDashboard
              campaigns={orderedCampaigns}
              canCollect={Boolean(capabilities.create)}
              focusSection={toDashboardSection(activeTab.slug) ?? "overview"}
            />
          )}
        </>
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
