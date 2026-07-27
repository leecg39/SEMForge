import { AppShell } from "@/components/app/AppShell";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { otherAnalysis } from "@/data/app-pages";

export default function AiCitedMediaPage() {
  return (
    <AppShell activeToolkit="pr" activeHref="/pr-toolkit/ai-cited-media/">
      <AppAnalysisTemplate data={otherAnalysis["/pr-toolkit/ai-cited-media/"]} />
    </AppShell>
  );
}
