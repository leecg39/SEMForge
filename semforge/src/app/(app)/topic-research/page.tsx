import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import {
  SeoLiveAnalysisDashboard,
  type SeoLiveAnalysisData,
} from "@/components/seo-tools/SeoLiveAnalysisDashboard";
import { db } from "@/db/client";
import { folders } from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { getAuth } from "@/lib/session";
import { getDomainAnalytics } from "@/server/analytics";
import { getSeoProjectSettings } from "@/server/seo-projects/settings";

export default async function TopicResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; domain?: string; q?: string }>;
}) {
  const query = await searchParams;
  const auth = await getAuth();
  if (!auth) redirect("/");
  const projects = await db
    .select({ id: folders.id, name: folders.name, domain: folders.domain })
    .from(folders)
    .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)));
  const requestedDomain = query.domain ? normalizeDomain(query.domain) : "";
  const project =
    projects.find((row) => row.id === query.project) ??
    projects.find((row) => normalizeDomain(row.domain) === requestedDomain) ??
    projects[0];
  if (!project) redirect("/home/");

  const settings = await getSeoProjectSettings(auth, project.id);
  const report = await getDomainAnalytics({
    domain: normalizeDomain(project.domain),
    countryCode: settings.countryCode,
    device: settings.device,
  });
  const search = query.q?.trim().toLocaleLowerCase() ?? "";
  const rowsByKeyword = new Map<
    string,
    { keyword: string; source: string; position: number | null; url: string | null }
  >();
  const siteCandidates = new Set(
    (report?.external?.site?.keywordCandidates ?? []).map((keyword) =>
      keyword.toLocaleLowerCase(),
    ),
  );
  for (const keyword of report?.external?.keywordCandidates ?? []) {
    if (search && !keyword.toLocaleLowerCase().includes(search)) continue;
    const fromSite = siteCandidates.has(keyword.toLocaleLowerCase());
    rowsByKeyword.set(keyword.toLocaleLowerCase(), {
      keyword,
      source: fromSite ? "firecrawl-site-content" : "analysis-seed",
      position: null,
      url: fromSite ? (report?.external?.site?.finalUrl ?? null) : null,
    });
  }
  for (const row of report?.topKeywords ?? []) {
    if (search && !row.keyword.toLocaleLowerCase().includes(search)) continue;
    rowsByKeyword.set(row.keyword.toLocaleLowerCase(), {
      keyword: row.keyword,
      source: "talordata-serp",
      position: row.position,
      url: row.url,
    });
  }
  const rows = [...rowsByKeyword.values()].toSorted(
    (a, b) => (a.position ?? 101) - (b.position ?? 101) || a.keyword.localeCompare(b.keyword),
  );
  const sourceUpdatedAt =
    report?.external?.capturedAt ?? report?.freshness.serpCapturedAt ?? null;
  const sourceRecords = report?.sources.reduce((sum, source) => sum + source.records, 0) ?? 0;
  const data: SeoLiveAnalysisData = {
    title: { ko: "주제 리서치", en: "Topic Research" },
    description: {
      ko: "분석 시드, 사이트에서 실제로 발견한 후보, 수집 SERP의 순위 키워드를 출처별로 조사합니다.",
      en: "Researches analysis seeds, candidates observed on the site, and ranking keywords from collected SERPs with source labels.",
    },
    domain: normalizeDomain(project.domain),
    projectId: project.id,
    countryCode: settings.countryCode,
    device: settings.device,
    sourceUpdatedAt,
    sourceRecords,
    form: { kind: "keyword", action: "/topic-research/", value: query.q?.trim() ?? "" },
    metrics: [
      { label: { ko: "주제 후보", en: "Topic candidates" }, value: rows.length },
      { label: { ko: "사이트 발견", en: "Found on site" }, value: rows.filter((row) => row.source === "firecrawl-site-content").length },
      { label: { ko: "순위 관찰", en: "Observed rankings" }, value: rows.filter((row) => row.source === "talordata-serp").length },
      { label: { ko: "분석 페이지", en: "Pages analyzed" }, value: report?.external?.site?.pagesAnalyzed ?? null },
    ],
    columns: [
      { key: "keyword", label: { ko: "주제·키워드", en: "Topic / keyword" } },
      { key: "source", label: { ko: "실측 원천", en: "Observed source" } },
      { key: "position", label: { ko: "순위", en: "Position" }, align: "right" },
      { key: "url", label: { ko: "근거 URL", en: "Evidence URL" } },
    ],
    rows: rows.map((row) => ({ ...row })),
    empty: search
      ? { ko: "검색어와 일치하는 실제 주제 후보가 없습니다", en: "No observed topic candidates match this query" }
      : { ko: "사이트 또는 SERP에서 발견된 주제 후보가 없습니다", en: "No topic candidates were found on the site or in SERPs" },
  };

  return (
    <AppShell
      activeToolkit="seo"
      activeHref="/topic-research/"
      projectContext={{
        label: project.name,
        href: `/seo/?project=${encodeURIComponent(project.id)}`,
        projectId: project.id,
      }}
    >
      <SeoLiveAnalysisDashboard data={data} />
    </AppShell>
  );
}
