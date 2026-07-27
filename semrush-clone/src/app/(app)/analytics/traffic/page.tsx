import { AppShell } from "@/components/app/AppShell";
import { AppLandingTemplate } from "@/components/app/AppLandingTemplate";
import { landings } from "@/data/app-pages";

export default function TrafficDashboardPage() {
  return (
    <AppShell activeToolkit="traffic" activeHref="/analytics/traffic/">
      <AppLandingTemplate data={landings.traffic} />
    </AppShell>
  );
}
