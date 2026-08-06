import { AppShell } from "@/components/app/AppShell";
import { TrafficOverviewDashboard } from "@/components/traffic/TrafficOverviewDashboard";
import { pageSession } from "@/server/page-auth";
import { getCampaignListSummary } from "@/server/position-tracking/overview";
import { listMarketingFolders } from "@/server/marketing/store";

export const dynamic = "force-dynamic";

export default async function TrafficDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { auth } = await pageSession();
  const { siteUrl, campaign, fid, view } = await searchParams;
  const [campaigns, folders] = await Promise.all([getCampaignListSummary(auth), listMarketingFolders(auth.workspaceId)]);
  const requestedFolderId = typeof fid === "string" && folders.some((folder) => folder.id === fid) ? fid : folders[0]?.id ?? "";
  return (
    <AppShell activeToolkit="traffic" activeHref="/analytics/traffic/">
      <TrafficOverviewDashboard
        campaigns={campaigns}
        folders={folders}
        initialFolderId={requestedFolderId}
        initialCampaignId={typeof campaign === "string" ? campaign : ""}
        initialSiteUrl={typeof siteUrl === "string" ? siteUrl : ""}
        initialView={view === "start" ? "overview" : "integrated"}
      />
    </AppShell>
  );
}
