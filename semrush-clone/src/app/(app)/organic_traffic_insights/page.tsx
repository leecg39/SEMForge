import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function OrganicTrafficInsightsPage() {
  return (
    <AppShell activeToolkit="seo" activeHref="/organic_traffic_insights/">
      <AppWorkspaceTemplate data={workspaces["/organic_traffic_insights/"]} />
    </AppShell>
  );
}
