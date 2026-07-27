import { AppShell } from "@/components/app/AppShell";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { seoAnalysis } from "@/data/app-pages";

export default function TopicResearchPage() {
  return (
    <AppShell activeToolkit="seo" activeHref="/topic-research/">
      <AppAnalysisTemplate data={seoAnalysis["/topic-research/"]} />
    </AppShell>
  );
}
