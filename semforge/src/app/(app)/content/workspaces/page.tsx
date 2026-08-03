import { AppShell } from "@/components/app/AppShell";
import { ContentWorkspaces } from "@/components/content/ContentWorkspaces";

export default function ContentWorkspacesPage() {
  return (
    <AppShell activeToolkit="content" activeHref="/content/workspaces/">
      <ContentWorkspaces />
    </AppShell>
  );
}
