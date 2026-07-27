import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function MyEmailsPage() {
  return (
    <AppShell activeToolkit="pr" activeHref="/pr-toolkit/emails">
      <AppWorkspaceTemplate data={workspaces["/pr-toolkit/emails"]} />
    </AppShell>
  );
}
