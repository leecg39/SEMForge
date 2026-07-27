import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function GbpAiAgentPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/gbp-ai-agent/">
      <AppWorkspaceTemplate data={workspaces["/gbp-ai-agent/"]} />
    </AppShell>
  );
}
