import { AppShell } from "@/components/app/AppShell";
import { AppStoreTemplate } from "@/components/app/AppStoreTemplate";
import { collection, collectionSlugs } from "@/data/app-pages";

export function generateStaticParams() {
  return collectionSlugs.map((slug) => ({ slug }));
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <AppShell activeToolkit="apps" activeHref="/apps/" hideSideNav>
      <AppStoreTemplate data={collection(slug)} />
    </AppShell>
  );
}
