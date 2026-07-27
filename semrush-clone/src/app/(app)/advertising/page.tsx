import { AppShell } from "@/components/app/AppShell";
import { AppLandingTemplate } from "@/components/app/AppLandingTemplate";
import { landings } from "@/data/app-pages";

export default function AdvertisingDashboardPage() {
  return (
    <AppShell activeToolkit="advertising" activeHref="/advertising/">
      <AppLandingTemplate data={landings.advertising} />
    </AppShell>
  );
}
