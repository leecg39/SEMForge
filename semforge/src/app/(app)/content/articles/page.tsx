import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function MyContentPage() {
  return (
    <AppShell activeToolkit="content" activeHref="/content/articles/">
      <AppWorkspaceTemplate data={workspaces["/content/articles/"]} />
    </AppShell>
  );
}
