import { AppShell } from "@/components/app/AppShell";
import { ContentArticlePage } from "@/components/content/ContentArticlePage";

export default async function ContentLibraryArticlePage({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params;
  return (
    <AppShell activeToolkit="content" activeHref="/content/library/">
      <ContentArticlePage articleId={articleId} />
    </AppShell>
  );
}
