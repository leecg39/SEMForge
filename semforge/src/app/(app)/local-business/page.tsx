import { AppShell } from "@/components/app/AppShell";
import { LocalOverviewDashboard } from "@/components/local/LocalOverviewDashboard";

export default function LocalDashboardPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/local-business/">
      <LocalOverviewDashboard />
    </AppShell>
  );
}
