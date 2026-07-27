import { HubTemplate } from "@/components/templates/HubTemplate";
import { hubs } from "@/data/hubs";

export function generateStaticParams() {
  return [{ slug: ["global", "all"] }];
}

export const metadata = { title: "Trending Websites | Semrush UI Clone" };

export default async function TrendingWebsitesPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  await params;
  return <HubTemplate data={hubs["trending-websites"]} />;
}
