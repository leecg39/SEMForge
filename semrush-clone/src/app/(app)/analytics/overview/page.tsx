import { AppShell } from "@/components/app/AppShell";
import { DomainIntelligenceDashboard } from "@/components/analytics/DomainIntelligenceDashboard";
import { getDomainAnalytics } from "@/server/analytics";

export const dynamic = "force-dynamic";

export default async function DomainOverviewPage() {
  const initialReport = await getDomainAnalytics({
    domain: "northwind.example.com",
    countryCode: "US",
    device: "desktop",
  });

  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/overview/">
      <DomainIntelligenceDashboard initialReport={initialReport} />
    </AppShell>
  );
}
