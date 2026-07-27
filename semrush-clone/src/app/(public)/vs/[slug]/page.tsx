import { notFound } from "next/navigation";
import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { vsData } from "@/data/misc";

export function generateStaticParams() {
  return Object.keys(vsData).map((slug) => ({ slug }));
}

export default async function VsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = vsData[slug];
  if (!data) notFound();
  return <DetailTemplate data={data} />;
}
