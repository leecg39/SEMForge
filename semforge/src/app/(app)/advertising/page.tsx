import { AppShell } from "@/components/app/AppShell";
import { AdvertisingDashboard } from "@/components/advertising/AdvertisingDashboard";

export default function AdvertisingDashboardPage() {
  return (
    <AppShell activeToolkit="advertising" activeHref="/advertising/">
      <AdvertisingDashboard />
    </AppShell>
  );
}
