import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function GbpOptimizationPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/gbp-optimization/">
      <AppWorkspaceTemplate data={workspaces["/gbp-optimization/"]} />
    </AppShell>
  );
}
