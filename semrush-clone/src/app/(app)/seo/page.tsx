import { AppShell } from "@/components/app/AppShell";
import { AppLandingTemplate } from "@/components/app/AppLandingTemplate";
import { landings } from "@/data/app-pages";

export default function SeoDashboardPage() {
  return (
    <AppShell activeToolkit="seo" activeHref="/seo/">
      <AppLandingTemplate data={landings.seo} />
    </AppShell>
  );
}
