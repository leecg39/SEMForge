import { notFound } from "next/navigation";
import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { featuresData, featureSlugs } from "@/data/features";

export function generateStaticParams() {
  return featureSlugs.map((slug) => ({ slug }));
}

export default async function FeatureDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = featuresData[slug];
  if (!data) notFound();
  return <DetailTemplate data={data} />;
}
