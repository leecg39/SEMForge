import { AppShell } from "@/components/app/AppShell";
import { BacklinkAnalytics } from "@/components/analytics/backlinks/BacklinkAnalytics";
import type { BacklinkScope } from "@/server/backlinks/contracts";
import { pageSession } from "@/server/page-auth";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BacklinkAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await pageSession();
  const params = await searchParams;
  const target = single(params.target)?.trim() ?? "";
  const rawScope = single(params.scope);
  const scope: BacklinkScope = rawScope === "subdomain" || rawScope === "page" ? rawScope : "root_domain";
  const rawTab = single(params.tab);
  const allowedTabs = ["overview", "links", "ref_domains", "anchors", "pages"] as const;
  const tab = allowedTabs.find((value) => value === rawTab) ?? "overview";
  const parsedPage = Number(single(params.page) ?? 1);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const direction = single(params.direction) === "asc" ? "asc" as const : "desc" as const;

  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/backlinks/overview/">
      <BacklinkAnalytics
        key={`${target}|${scope}`}
        initialTarget={target}
        initialScope={scope}
        initialTab={tab}
        initialPage={page}
        initialSort={single(params.sort)}
        initialDirection={direction}
      />
    </AppShell>
  );
}
