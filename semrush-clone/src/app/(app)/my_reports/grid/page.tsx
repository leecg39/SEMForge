import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function MyReportsPage() {
  return (
    <AppShell activeToolkit="reports" activeHref="/my_reports/grid/">
      <AppWorkspaceTemplate data={workspaces["/my_reports/grid/"]} />
    </AppShell>
  );
}
