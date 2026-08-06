import { AppShell } from "@/components/app/AppShell";
import { BacklinkGapAnalysis } from "@/components/analytics/backlinks/BacklinkGapAnalysis";
import { pageSession } from "@/server/page-auth";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function BacklinkGapPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await pageSession();
  const params = await searchParams;
  const competitors = single(params.competitors).split(",").map((value) => value.trim()).filter(Boolean).slice(0, 4);
  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/gap/backlinks/">
      <BacklinkGapAnalysis initialOwnSiteUrl={single(params.own)} initialCompetitors={competitors} />
    </AppShell>
  );
}
