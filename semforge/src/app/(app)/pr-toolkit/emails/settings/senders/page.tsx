import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function SendersPage() {
  return (
    <AppShell activeToolkit="pr" activeHref="/pr-toolkit/emails/settings/senders/">
      <AppWorkspaceTemplate data={workspaces["/pr-toolkit/emails/settings/senders/"]} />
    </AppShell>
  );
}
