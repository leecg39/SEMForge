import { AppShell } from "@/components/app/AppShell";
import { TrafficOverviewDashboard } from "@/components/traffic/TrafficOverviewDashboard";
import { pageSession } from "@/server/page-auth";
import { getCampaignListSummary } from "@/server/position-tracking/overview";

export const dynamic = "force-dynamic";

export default async function TrafficDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { auth } = await pageSession();
  const { siteUrl, campaign } = await searchParams;
  const campaigns = await getCampaignListSummary(auth);
  return (
    <AppShell activeToolkit="traffic" activeHref="/analytics/traffic/">
      <TrafficOverviewDashboard
        campaigns={campaigns}
        initialCampaignId={typeof campaign === "string" ? campaign : ""}
        initialSiteUrl={typeof siteUrl === "string" ? siteUrl : ""}
        initialView="overview"
      />
    </AppShell>
  );
}
