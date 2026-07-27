import { AppShell } from "@/components/app/AppShell";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { otherAnalysis } from "@/data/app-pages";

export default function SocialMediaMonitoringPage() {
  return (
    <AppShell activeToolkit="social" activeHref="/media-monitoring/">
      <AppAnalysisTemplate data={otherAnalysis["/media-monitoring/"]} />
    </AppShell>
  );
}
