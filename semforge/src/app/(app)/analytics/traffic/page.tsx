import { AppShell } from "@/components/app/AppShell";
import { TrafficOverviewDashboard } from "@/components/traffic/TrafficOverviewDashboard";

export default async function TrafficDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteUrl } = await searchParams;
  return (
    <AppShell activeToolkit="traffic" activeHref="/analytics/traffic/">
      <TrafficOverviewDashboard initialSiteUrl={typeof siteUrl === "string" ? siteUrl : ""} />
    </AppShell>
  );
}
