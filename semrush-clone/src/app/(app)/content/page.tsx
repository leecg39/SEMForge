import { AppShell } from "@/components/app/AppShell";
import { AppLandingTemplate } from "@/components/app/AppLandingTemplate";
import { landings } from "@/data/app-pages";

export default function ContentDashboardPage() {
  return (
    <AppShell activeToolkit="content" activeHref="/content/">
      <AppLandingTemplate data={landings.content} />
    </AppShell>
  );
}
