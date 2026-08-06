import { AppShell } from "@/components/app/AppShell";
import { BacklinkAnalytics } from "@/components/analytics/backlinks/BacklinkAnalytics";
import type { BacklinkDataset, BacklinkProvider, BacklinkScope } from "@/server/backlinks/contracts";
import { normalizeLegacyBacklinkScope } from "@/server/backlinks/target";
import { pageSession } from "@/server/page-auth";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BacklinkAnalyticsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await pageSession();
  const params = await searchParams;
  const legacyTarget = single(params.target)?.trim() ?? "";
  const siteUrl = single(params.siteUrl)?.trim() ?? (legacyTarget ? legacyTarget : "");
  const targetUrl = single(params.targetUrl)?.trim() ?? "";
  const scope: BacklinkScope = normalizeLegacyBacklinkScope(single(params.scope));
  const rawTab = single(params.tab);
  const tab: "overview" | BacklinkDataset = rawTab === "target_pages" || rawTab === "inbound_links" ? rawTab : "overview";
  const rawProvider = single(params.provider);
  const provider: BacklinkProvider | undefined = rawProvider === "bing-csv" || rawProvider === "bing-webmaster" || rawProvider === "common-crawl" ? rawProvider : undefined;
  const parsedPage = Number(single(params.page) ?? 1);
  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/backlinks/overview/">
      <BacklinkAnalytics
        initialSiteUrl={siteUrl}
        initialTargetUrl={targetUrl}
        initialScope={scope}
        initialProvider={provider}
        initialTab={tab}
        initialTargetPage={single(params.targetPage) ?? ""}
        initialPage={Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1}
        initialSort={single(params.sort)}
        initialDirection={single(params.direction) === "asc" ? "asc" : "desc"}
      />
    </AppShell>
  );
}
