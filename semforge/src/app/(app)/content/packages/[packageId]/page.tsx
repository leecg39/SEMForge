import { AppShell } from "@/components/app/AppShell";
import { ContentPackageStudio } from "@/components/content/ContentPackageStudio";

export default async function ContentPackagePage({ params }: { params: Promise<{ packageId: string }> }) {
  const { packageId } = await params;
  return <AppShell activeToolkit="content" hideSideNav><ContentPackageStudio packageId={packageId} /></AppShell>;
}
