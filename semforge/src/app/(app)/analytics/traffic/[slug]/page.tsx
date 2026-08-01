import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { PendingTool } from "@/components/local/PendingTool";
import {
  TrafficOverviewDashboard,
  type TrafficMarketView,
} from "@/components/traffic/TrafficOverviewDashboard";
import { pageSession } from "@/server/page-auth";
import { getCampaignListSummary } from "@/server/position-tracking/overview";

export const dynamic = "force-dynamic";

const slugs = [
  "traffic-overview",
  "market-overview",
  "top-pages",
  "ai-traffic",
  "referral",
  "organic-search",
  "paid-search",
  "organic-social",
  "paid-social",
  "email",
  "display-ads",
  "sources-destinations",
  "subfolders-subdomains",
  "page-groups",
  "usa",
  "countries",
  "business-regions",
  "geographical-regions",
  "demographics",
  "audience-overlap",
  "socioeconomics",
  "behavior",
  "daily-trends",
  "industry-and-bulk-analysis",
  "competitor-monitoring",
  "trends-api",
] as const;

type Slug = (typeof slugs)[number];

const NO_FREE_SOURCE =
  "이 리포트는 추정 트래픽 패널(클릭스트림) 데이터가 필요합니다. 무료 데이터 소스로는 정직한 수치를 제공할 수 없어 준비 중으로 표시합니다. 자사 사이트의 검색 유입은 트래픽 개요(Search Console)에서 확인할 수 있습니다.";

const implementedViews: Partial<Record<Slug, TrafficMarketView>> = {
  "traffic-overview": "traffic",
  "organic-search": "traffic",
  countries: "traffic",
  "market-overview": "market",
  "competitor-monitoring": "market",
  "top-pages": "pages",
};

const pendingTitles: Partial<Record<Slug, string>> = {
  "market-overview": "Market Overview",
  "top-pages": "Top Pages",
  "ai-traffic": "AI Traffic",
  referral: "Referral",
  "organic-search": "Organic Search",
  "paid-search": "Paid Search",
  "organic-social": "Organic Social",
  "paid-social": "Paid Social",
  email: "Email",
  "display-ads": "Display Ads",
  "sources-destinations": "Sources & Destinations",
  "subfolders-subdomains": "Subfolders & Subdomains",
  "page-groups": "Page Groups",
  usa: "USA Traffic",
  countries: "Countries",
  "business-regions": "Business Regions",
  "geographical-regions": "Geographical Regions",
  demographics: "Demographics",
  "audience-overlap": "Audience Overlap",
  socioeconomics: "Socioeconomics",
  behavior: "Behavior",
  "daily-trends": "Daily Trends",
  "industry-and-bulk-analysis": "Industry & Bulk Analysis",
  "competitor-monitoring": "Competitor Monitoring",
  "trends-api": "Trends API",
};

export function generateStaticParams() {
  return slugs.map((slug) => ({ slug }));
}

export default async function TrafficSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { auth } = await pageSession();
  const { slug } = await params;
  const { siteUrl, campaign } = await searchParams;
  const href = `/analytics/traffic/${slug}/`;

  if (!slugs.includes(slug as Slug)) notFound();

  const view = implementedViews[slug as Slug];
  if (view) {
    const campaigns = await getCampaignListSummary(auth);
    return (
      <AppShell activeToolkit="traffic" activeHref={href}>
        <TrafficOverviewDashboard
          campaigns={campaigns}
          initialCampaignId={typeof campaign === "string" ? campaign : ""}
          initialSiteUrl={typeof siteUrl === "string" ? siteUrl : ""}
          initialView={view}
        />
      </AppShell>
    );
  }

  return (
    <AppShell activeToolkit="traffic" activeHref={href}>
      <PendingTool
        toolkit="Traffic & Market"
        title={pendingTitles[slug as Slug] ?? "Traffic & Market"}
        reason={NO_FREE_SOURCE}
      />
    </AppShell>
  );
}
