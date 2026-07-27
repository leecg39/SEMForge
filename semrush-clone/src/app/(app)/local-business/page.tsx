import { AppShell } from "@/components/app/AppShell";
import { AppLandingTemplate } from "@/components/app/AppLandingTemplate";
import { landings } from "@/data/app-pages";

export default function LocalDashboardPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/local-business/">
      <AppLandingTemplate data={landings.local} />
    </AppShell>
  );
}
