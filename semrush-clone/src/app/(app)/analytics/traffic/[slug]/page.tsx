import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { AppLandingTemplate } from "@/components/app/AppLandingTemplate";
import { trafficAnalysis, trafficSlugs, workspaces, landings } from "@/data/app-pages";

export function generateStaticParams() {
  return [...trafficSlugs, "competitor-monitoring", "trends-api"].map((slug) => ({ slug }));
}

export default async function TrafficSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const href = `/analytics/traffic/${slug}/`;

  if (slug === "competitor-monitoring") {
    return (
      <AppShell activeToolkit="traffic" activeHref="/analytics/traffic/competitor-monitoring/">
        <AppWorkspaceTemplate data={workspaces["/analytics/traffic/competitor-monitoring/"]} />
      </AppShell>
    );
  }
  if (slug === "trends-api") {
    return (
      <AppShell activeToolkit="traffic" activeHref="/analytics/traffic/trends-api">
        <AppLandingTemplate
          data={{
            ...landings.traffic,
            activeHref: "/analytics/traffic/trends-api",
            title: "Trends API",
            description: "Access traffic and market datasets programmatically through the Trends API.",
          }}
        />
      </AppShell>
    );
  }
  const data = trafficAnalysis[slug];
  if (!data) notFound();
  return (
    <AppShell activeToolkit="traffic" activeHref={href}>
      <AppAnalysisTemplate data={data} />
    </AppShell>
  );
}
