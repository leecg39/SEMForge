import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function PositionTrackingPage() {
  return (
    <AppShell activeToolkit="seo" activeHref="/position-tracking/">
      <AppWorkspaceTemplate data={workspaces["/position-tracking/"]} />
    </AppShell>
  );
}
