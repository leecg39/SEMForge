import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function ListingsManagementPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/listings-management/">
      <AppWorkspaceTemplate data={workspaces["/listings-management/"]} />
    </AppShell>
  );
}
