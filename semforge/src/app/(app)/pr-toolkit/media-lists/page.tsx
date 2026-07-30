import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function MediaListsPage() {
  return (
    <AppShell activeToolkit="pr" activeHref="/pr-toolkit/media-lists/">
      <AppWorkspaceTemplate data={workspaces["/pr-toolkit/media-lists/"]} />
    </AppShell>
  );
}
