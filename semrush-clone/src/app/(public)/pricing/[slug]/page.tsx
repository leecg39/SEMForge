import { notFound } from "next/navigation";
import { PricingTemplate } from "@/components/templates/PricingTemplate";
import { pricingData, pricingEnterprise, pricingSlugs } from "@/data/pricing";

export function generateStaticParams() {
  return [...pricingSlugs, "enterprise"].map((slug) => ({ slug }));
}

export default async function PricingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "enterprise") return <PricingTemplate data={pricingEnterprise} />;
  const data = pricingData[slug];
  if (!data) notFound();
  return <PricingTemplate data={data} />;
}
