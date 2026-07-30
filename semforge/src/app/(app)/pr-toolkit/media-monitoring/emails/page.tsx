import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function AlertsSummariesPage() {
  return (
    <AppShell activeToolkit="pr" activeHref="/pr-toolkit/media-monitoring/emails/">
      <AppWorkspaceTemplate data={workspaces["/pr-toolkit/media-monitoring/emails/"]} />
    </AppShell>
  );
}
