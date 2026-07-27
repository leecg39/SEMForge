import { notFound } from "next/navigation";
import { SolutionTemplate } from "@/components/templates/SolutionTemplate";
import { HubTemplate } from "@/components/templates/HubTemplate";
import { solutionsData, solutionSlugs } from "@/data/solutions";
import { hubs } from "@/data/hubs";

const hubSlugs: Record<string, keyof typeof hubs> = {
  "use-cases": "use-cases",
  role: "role",
  industry: "industry",
};

export function generateStaticParams() {
  return [...solutionSlugs, ...Object.keys(hubSlugs)].map((slug) => ({ slug }));
}

export default async function SolutionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (hubSlugs[slug]) return <HubTemplate data={hubs[hubSlugs[slug]]} />;
  const data = solutionsData[slug];
  if (!data) notFound();
  return <SolutionTemplate data={data} />;
}
