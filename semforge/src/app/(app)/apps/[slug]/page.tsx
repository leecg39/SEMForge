import { AppShell } from "@/components/app/AppShell";
import { AppStoreTemplate } from "@/components/app/AppStoreTemplate";
import { appDetail, appFeaturedSlugs } from "@/data/app-pages";

export function generateStaticParams() {
  return appFeaturedSlugs.map((slug) => ({ slug }));
}

export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <AppShell activeToolkit="apps" activeHref="/apps/" hideSideNav>
      <AppStoreTemplate data={appDetail(slug)} />
    </AppShell>
  );
}
