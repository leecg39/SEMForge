import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function ReviewManagementPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/review-management/">
      <AppWorkspaceTemplate data={workspaces["/review-management/"]} />
    </AppShell>
  );
}
