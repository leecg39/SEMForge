import { AppShell } from "@/components/app/AppShell";
import { ContentProductionStudio } from "@/components/content/ContentProductionStudio";

export default async function ContentProductionPage({ params }: { params: Promise<{ productionId: string }> }) {
  const { productionId } = await params;
  return (
    <AppShell activeToolkit="content" hideSideNav>
      <ContentProductionStudio productionId={productionId} />
    </AppShell>
  );
}
