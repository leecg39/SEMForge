import { AppShell } from "@/components/app/AppShell";
import { AppLandingTemplate } from "@/components/app/AppLandingTemplate";
import { landings } from "@/data/app-pages";

export default function PrDashboardPage() {
  return (
    <AppShell activeToolkit="pr" activeHref="/pr-toolkit/">
      <AppLandingTemplate data={landings.pr} />
    </AppShell>
  );
}
