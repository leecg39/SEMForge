import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { AppLandingTemplate } from "@/components/app/AppLandingTemplate";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { landings, aiAnalysis, workspaces } from "@/data/app-pages";

const slugs = [
  "overview",
  "competitor-research",
  "prompt-research",
  "brand-performance",
  "perception",
  "narrative-drivers",
  "questions",
  "growth-plan",
];

export function generateStaticParams() {
  return slugs.map((slug) => ({ slug }));
}

export default async function AiSeoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const href = `/ai-seo/${slug}/`;

  if (slug === "overview") {
    return (
      <AppShell activeToolkit="ai" activeHref={href}>
        <AppLandingTemplate data={landings.ai} />
      </AppShell>
    );
  }
  if (slug === "growth-plan") {
    return (
      <AppShell activeToolkit="ai" activeHref={href}>
        <AppWorkspaceTemplate data={workspaces["/ai-seo/growth-plan/"]} />
      </AppShell>
    );
  }
  const data = aiAnalysis[href];
  if (!data) notFound();
  return (
    <AppShell activeToolkit="ai" activeHref={href}>
      <AppAnalysisTemplate data={data} />
    </AppShell>
  );
}
