import { AppShell } from "@/components/app/AppShell";
import { ContentBoard } from "@/components/content/ContentBoard";

export default async function ContentBoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  return (
    <AppShell activeToolkit="content" hideSideNav>
      <ContentBoard boardId={boardId} />
    </AppShell>
  );
}
