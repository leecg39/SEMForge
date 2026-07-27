import { AppShell } from "@/components/app/AppShell";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { otherAnalysis } from "@/data/app-pages";

export default function MapRankTrackerPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/map-rank-tracker/">
      <AppAnalysisTemplate data={otherAnalysis["/map-rank-tracker/"]} />
    </AppShell>
  );
}
