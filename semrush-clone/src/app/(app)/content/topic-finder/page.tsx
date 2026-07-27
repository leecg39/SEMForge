import { AppShell } from "@/components/app/AppShell";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { otherAnalysis } from "@/data/app-pages";

export default function TopicFinderPage() {
  return (
    <AppShell activeToolkit="content" activeHref="/content/topic-finder/">
      <AppAnalysisTemplate data={otherAnalysis["/content/topic-finder/"]} />
    </AppShell>
  );
}
