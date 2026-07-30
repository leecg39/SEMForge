import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function AdsAiAgentPage() {
  return (
    <AppShell activeToolkit="advertising" activeHref="/advertising/ads-ai-agent">
      <AppWorkspaceTemplate data={workspaces["/advertising/ads-ai-agent"]} />
    </AppShell>
  );
}
