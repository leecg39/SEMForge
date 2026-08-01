import { AppShell } from "@/components/app/AppShell";
import { AdsAiAgentDashboard } from "@/components/advertising/AdsAiAgentDashboard";

export default function AdsAiAgentPage() {
  return (
    <AppShell activeToolkit="advertising" activeHref="/advertising/ads-ai-agent">
      <AdsAiAgentDashboard />
    </AppShell>
  );
}
