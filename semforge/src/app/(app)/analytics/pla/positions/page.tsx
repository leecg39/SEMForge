import { AppShell } from "@/components/app/AppShell";
import { AdvertisingResearchDashboard } from "@/components/advertising/AdvertisingResearchDashboard";

export default function PlaPositionsPage() {
  return (
    <AppShell activeToolkit="advertising" activeHref="/analytics/pla/positions">
      <AdvertisingResearchDashboard mode="shopping" />
    </AppShell>
  );
}
