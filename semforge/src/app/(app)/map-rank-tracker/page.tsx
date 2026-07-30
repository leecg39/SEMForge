import { AppShell } from "@/components/app/AppShell";
import { MapRankDashboard } from "@/components/local/MapRankDashboard";

export default function MapRankTrackerPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/map-rank-tracker/">
      <MapRankDashboard />
    </AppShell>
  );
}
