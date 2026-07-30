import { notFound } from "next/navigation";
import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

const programs = [
  "affiliate-program",
  "enterprise-aio",
  "site-intelligence",
  "insights",
  "mfour",
  "semforge-circle",
];

export function generateStaticParams() {
  return programs.map((p) => ({ slug: [p, "en"] }));
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const data = detailLandings[`lp/${slug[0]}`];
  if (!data) notFound();
  return <DetailTemplate data={data} />;
}
