import { AppShell } from "@/components/app/AppShell";
import { AdvertisingResearchDashboard } from "@/components/advertising/AdvertisingResearchDashboard";

export default function AdvertisingPositionsPage() {
  return (
    <AppShell activeToolkit="advertising" activeHref="/analytics/adwords/positions">
      <AdvertisingResearchDashboard mode="search" />
    </AppShell>
  );
}
