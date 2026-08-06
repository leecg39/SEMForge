import { notFound } from "next/navigation";
import { ToolTemplate } from "@/components/templates/ToolTemplate";
import { HubTemplate } from "@/components/templates/HubTemplate";
import { NaverKeywordPreview } from "@/components/free-tools/NaverKeywordPreview";
import { toolsData, toolSlugs } from "@/data/tools";
import { hubs } from "@/data/hubs";

const hubSlugs: Record<string, keyof typeof hubs> = {
  "ai-writing-tools": "ai-writing-tools",
  seo: "free-tools-seo",
  "local-seo": "free-tools-local",
};

export function generateStaticParams() {
  return [...toolSlugs, ...Object.keys(hubSlugs)].map((slug) => ({ slug }));
}

export default async function FreeToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (hubSlugs[slug]) return <HubTemplate data={hubs[hubSlugs[slug]]} />;
  if (slug === "keyword-search-volume-checker") return <NaverKeywordPreview />;
  const data = toolsData[slug];
  if (!data) notFound();
  return <ToolTemplate data={data} />;
}
