import { AppShell } from "@/components/app/AppShell";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { otherAnalysis } from "@/data/app-pages";

export default function MediaMonitoringPage() {
  return (
    <AppShell activeToolkit="pr" activeHref="/pr-toolkit/media-monitoring/">
      <AppAnalysisTemplate data={otherAnalysis["/pr-toolkit/media-monitoring/"]} />
    </AppShell>
  );
}
