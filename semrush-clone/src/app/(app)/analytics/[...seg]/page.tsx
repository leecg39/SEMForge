import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { seoAnalysis, otherAnalysis, workspaces } from "@/data/app-pages";

const analysisAll = { ...seoAnalysis, ...otherAnalysis };

// keywordoverview / organic/overview 는 전용 라이브 페이지로 이전됐다
// (analytics/keywordoverview/page.tsx, analytics/organic/overview/page.tsx).
const params: string[][] = [
  ["toppages"],
  ["comparedomains"],
  ["keywordgap"],
  ["gap", "backlinks"],
  ["keywordmagic"],
  ["backlinks", "overview"],
  ["refdomains", "report"],
  ["ranks", "rank"],
  ["keywordmanager"],
  ["adwords", "positions"],
  ["pla", "positions"],
];

export function generateStaticParams() {
  return params.map((seg) => ({ seg }));
}

function lookup<T>(reg: Record<string, T>, base: string): T | undefined {
  return reg[base] ?? reg[base + "/"] ?? reg[base.replace(/\/$/, "")];
}

export default async function AnalyticsPage({ params: p }: { params: Promise<{ seg: string[] }> }) {
  const { seg } = await p;
  const base = "/analytics/" + seg.join("/");

  const ws = lookup(workspaces, base);
  if (ws) {
    return (
      <AppShell activeToolkit={ws.toolkit} activeHref={ws.activeHref}>
        <AppWorkspaceTemplate data={ws} />
      </AppShell>
    );
  }
  const data = lookup(analysisAll, base);
  if (!data) notFound();
  return (
    <AppShell activeToolkit={data.toolkit} activeHref={data.activeHref}>
      <AppAnalysisTemplate data={data} />
    </AppShell>
  );
}
