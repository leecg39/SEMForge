import { AppShell } from "@/components/app/AppShell";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { otherAnalysis } from "@/data/app-pages";

export default function MediaDatabasePage() {
  return (
    <AppShell activeToolkit="pr" activeHref="/pr-toolkit/media-database/">
      <AppAnalysisTemplate data={otherAnalysis["/pr-toolkit/media-database/"]} />
    </AppShell>
  );
}
