import { and, eq, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import {
  SeoLiveAnalysisDashboard,
  type LocalizedLabel,
  type SeoLiveAnalysisData,
} from "@/components/seo-tools/SeoLiveAnalysisDashboard";
import { db } from "@/db/client";
import { folders, keywordListItems, keywordLists } from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import {
  buildDomainComparison,
  buildKeywordGap,
  buildKeywordIdeas,
  buildTopPages,
} from "@/lib/seo-tools";
import { getAuth } from "@/lib/session";
import { getAnalyticsDataset, getDomainAnalytics } from "@/server/analytics";
import { getSeoProjectSettings } from "@/server/seo-projects/settings";

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
];

export function generateStaticParams() {
  return params.map((seg) => ({ seg }));
}

const l = (ko: string, en: string): LocalizedLabel => ({ ko, en });
const column = (key: string, ko: string, en: string, align?: "left" | "right") => ({
  key,
  label: l(ko, en),
  ...(align ? { align } : {}),
});

function reportSource(report: DomainAnalyticsReport | null) {
  if (!report) return { sourceUpdatedAt: null, sourceRecords: 0 };
  const timestamps = Object.values(report.freshness)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return {
    sourceUpdatedAt:
      timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
    sourceRecords: report.sources.reduce((sum, source) => sum + source.records, 0),
  };
}

interface BaseInput {
  key: string;
  domain: string;
  projectId: string;
  countryCode: string;
  device: "desktop" | "mobile";
  report: DomainAnalyticsReport | null;
  competitorReport: DomainAnalyticsReport | null;
  competitor: string;
  competitorOptions: string[];
  reports: DomainAnalyticsReport[];
  keywordQuery: string;
  keywordIdeas: ReturnType<typeof buildKeywordIdeas>;
  keywordLists: Array<{
    name: string;
    mode: string;
    database: string;
    seed: string | null;
    status: string;
    keywords: number;
  }>;
}

function buildPageData(input: BaseInput): SeoLiveAnalysisData {
  const common = {
    domain: input.domain,
    projectId: input.projectId,
    countryCode: input.countryCode,
    device: input.device,
    ...reportSource(input.report),
  };
  const report = input.report;

  if (input.key === "toppages") {
    const rows = report ? buildTopPages(report) : [];
    return {
      ...common,
      title: l("상위 페이지", "Top Pages"),
      description: l("실제 SERP에서 이 도메인이 순위에 오른 URL을 페이지별로 집계합니다.", "Aggregates URLs where this domain ranked in collected SERPs."),
      metrics: [
        { label: l("순위 페이지", "Ranking pages"), value: rows.length },
        { label: l("자연 키워드", "Organic keywords"), value: report?.metrics.organicKeywords ?? 0 },
        { label: l("최고 순위", "Best position"), value: rows.length ? Math.min(...rows.map((row) => row.bestPosition)) : null },
        { label: l("추정 트래픽", "Estimated traffic"), value: report?.metrics.organicTrafficEstimate?.value ?? null },
      ],
      columns: [column("url", "URL", "URL"), column("keywords", "키워드", "Keywords", "right"), column("bestPosition", "최고 순위", "Best position", "right"), column("trafficEstimate", "추정 트래픽", "Estimated traffic", "right")],
      rows: rows.map((row) => ({ ...row })),
      empty: l("수집된 SERP에서 순위 URL을 찾지 못했습니다", "No ranking URLs were found in collected SERPs"),
    };
  }

  if (input.key === "comparedomains" || input.key === "ranks/rank") {
    const rows = buildDomainComparison(input.reports).toSorted(
      (a, b) => b.keywords - a.keywords || (a.bestPosition ?? 101) - (b.bestPosition ?? 101),
    );
    const rank = rows.findIndex((row) => row.domain === input.domain);
    return {
      ...common,
      title: input.key === "ranks/rank" ? l("SEMForge 순위", "SEMForge Rank") : l("도메인 비교", "Compare Domains"),
      description: l("동일한 국가·기기 조건의 실제 수집 SERP에 관찰된 도메인을 비교합니다.", "Compares domains observed in collected SERPs for the same country and device."),
      metrics: [
        { label: l("관찰 도메인", "Observed domains"), value: rows.length },
        { label: l("내 순위", "My rank"), value: rank >= 0 ? rank + 1 : null },
        { label: l("내 키워드", "My keywords"), value: report?.metrics.organicKeywords ?? 0 },
        { label: l("내 최고 순위", "My best position"), value: report?.topKeywords.length ? Math.min(...report.topKeywords.map((row) => row.position)) : null },
      ],
      columns: [column("domain", "도메인", "Domain"), column("keywords", "키워드", "Keywords", "right"), column("bestPosition", "최고 순위", "Best position", "right"), column("organicTrafficEstimate", "추정 트래픽", "Estimated traffic", "right"), column("authorityScore", "권위 점수", "Authority Score", "right"), column("backlinks", "백링크", "Backlinks", "right")],
      rows: rows.map((row) => ({ ...row })),
      empty: l("비교할 실제 SERP 도메인이 없습니다", "No observed SERP domains are available for comparison"),
    };
  }

  if (input.key === "keywordgap") {
    const rows = report && input.competitorReport ? buildKeywordGap(report, input.competitorReport) : [];
    return {
      ...common,
      title: l("키워드 갭", "Keyword Gap"),
      description: l("두 도메인의 실제 수집 순위를 대조해 누락·약함·공유·고유 키워드를 분류합니다.", "Classifies missing, weak, shared, and unique keywords from collected rankings."),
      form: { kind: "competitor", action: "/analytics/keywordgap/", value: input.competitor, options: input.competitorOptions },
      metrics: [
        { label: l("누락 키워드", "Missing keywords"), value: rows.filter((row) => row.gap === "missing").length },
        { label: l("약한 키워드", "Weak keywords"), value: rows.filter((row) => row.gap === "weak").length },
        { label: l("공유 키워드", "Shared keywords"), value: rows.filter((row) => row.gap === "shared").length },
        { label: l("고유 키워드", "Unique keywords"), value: rows.filter((row) => row.gap === "unique").length },
      ],
      columns: [column("keyword", "키워드", "Keyword"), column("gap", "분류", "Type"), column("targetPosition", "내 순위", "My position", "right"), column("competitorPosition", "경쟁사 순위", "Competitor position", "right"), column("volume", "검색량", "Volume", "right")],
      rows: rows.map((row) => ({ ...row })),
      empty: l("두 도메인을 비교할 공통 수집 데이터가 없습니다", "No collected data is available to compare these domains"),
    };
  }

  if (input.key === "keywordmagic") {
    return {
      ...common,
      title: l("키워드 매직 도구", "Keyword Magic Tool"),
      description: l("워크스페이스에 실제로 수집된 키워드에서 입력어를 포함한 항목만 검색합니다.", "Searches only keywords actually collected in this workspace."),
      form: { kind: "keyword", action: "/analytics/keywordmagic/", value: input.keywordQuery },
      metrics: [
        { label: l("검색 결과", "Results"), value: input.keywordIdeas.length },
        { label: l("검색량 제공", "With volume"), value: input.keywordIdeas.filter((row) => row.volume !== null).length },
        { label: l("의도 제공", "With intent"), value: input.keywordIdeas.filter((row) => row.intent !== null).length },
        { label: l("원천 레코드", "Source records"), value: common.sourceRecords },
      ],
      columns: [column("keyword", "키워드", "Keyword"), column("volume", "검색량", "Volume", "right"), column("intent", "의도", "Intent"), column("cpcCents", "CPC(센트)", "CPC (cents)", "right"), column("source", "원천", "Source"), column("updatedAt", "갱신 시각", "Updated at")],
      rows: input.keywordIdeas.map((row) => ({ ...row })),
      empty: input.keywordQuery ? l("일치하는 실제 수집 키워드가 없습니다", "No collected keywords match this query") : l("검색할 키워드를 입력하세요", "Enter a keyword to search"),
    };
  }

  if (input.key === "keywordmanager") {
    return {
      ...common,
      title: l("키워드 전략 빌더", "Keyword Strategy Builder"),
      description: l("현재 프로젝트에 저장된 실제 키워드 목록과 상태를 표시합니다.", "Shows keyword lists actually saved for the current project."),
      metrics: [
        { label: l("키워드 목록", "Keyword lists"), value: input.keywordLists.length },
        { label: l("저장 키워드", "Saved keywords"), value: input.keywordLists.reduce((sum, row) => sum + row.keywords, 0) },
        { label: l("준비됨", "Ready"), value: input.keywordLists.filter((row) => row.status === "ready").length },
        { label: l("생성 중", "Generating"), value: input.keywordLists.filter((row) => row.status === "generating").length },
      ],
      columns: [column("name", "목록명", "List"), column("mode", "생성 방식", "Mode"), column("database", "데이터베이스", "Database"), column("seed", "시드", "Seed"), column("status", "상태", "Status"), column("keywords", "키워드", "Keywords", "right")],
      rows: input.keywordLists,
      empty: l("현재 프로젝트에 저장된 키워드 목록이 없습니다", "No keyword lists are saved for this project"),
    };
  }

  if (input.key === "gap/backlinks") {
    return {
      ...common,
      title: l("백링크 갭", "Backlink Gap"),
      description: l("경쟁사 참조 도메인과 자사 링크 그래프를 비교합니다. 현재는 인바운드 링크 공급자가 연결되지 않았습니다.", "Compares competitor referring domains with your link graph. No inbound-link provider is connected yet."),
      form: { kind: "competitor", action: "/analytics/gap/backlinks/", value: input.competitor, options: input.competitorOptions },
      metrics: [
        { label: l("자사 백링크", "Your backlinks"), value: report?.metrics.backlinks ?? null },
        { label: l("자사 참조 도메인", "Your referring domains"), value: report?.metrics.referringDomains ?? null },
        { label: l("경쟁사 백링크", "Competitor backlinks"), value: input.competitorReport?.metrics.backlinks ?? null },
        { label: l("링크 기회", "Link prospects"), value: null },
      ],
      columns: [column("domain", "참조 도메인", "Referring domain"), column("target", "연결 대상", "Links to"), column("backlinks", "백링크", "Backlinks", "right")],
      rows: [],
      empty: l("인바운드 링크 원천이 연결되지 않아 갭을 계산할 수 없습니다", "An inbound-link source is required to calculate backlink gaps"),
    };
  }

  if (input.key === "backlinks/overview") {
    const rows = report?.topLinkedPages ?? [];
    return {
      ...common,
      title: l("백링크", "Backlinks"),
      description: l("연결된 링크 그래프에서 현재 도메인으로 들어오는 링크를 집계합니다.", "Aggregates inbound links to this domain from the connected link graph."),
      metrics: [
        { label: l("백링크", "Backlinks"), value: report?.metrics.backlinks ?? null },
        { label: l("참조 도메인", "Referring domains"), value: report?.metrics.referringDomains ?? null },
        { label: l("Follow 비율", "Follow share"), value: report?.metrics.followShare ?? null, suffix: "%" },
        { label: l("연결 페이지 그룹", "Linked page groups"), value: rows.length },
      ],
      columns: [column("host", "대상 호스트", "Target host"), column("backlinks", "백링크", "Backlinks", "right"), column("referringDomains", "참조 도메인", "Referring domains", "right")],
      rows: rows.map((row) => ({ ...row })),
      empty: l("연결된 인바운드 링크 데이터가 없습니다", "No connected inbound-link data is available"),
    };
  }

  const rows = report?.refDomainsByAuthority ?? [];
  return {
    ...common,
    title: l("참조 도메인", "Referring Domains"),
    description: l("실제 링크 그래프의 참조 도메인을 권위 점수 구간별로 집계합니다.", "Groups referring domains from the link graph by authority range."),
    metrics: [
      { label: l("참조 도메인", "Referring domains"), value: report?.metrics.referringDomains ?? null },
      { label: l("백링크", "Backlinks"), value: report?.metrics.backlinks ?? null },
      { label: l("권위 구간", "Authority buckets"), value: rows.length },
      { label: l("Follow 비율", "Follow share"), value: report?.metrics.followShare ?? null, suffix: "%" },
    ],
    columns: [column("bucket", "권위 점수 구간", "Authority range"), column("referringDomains", "참조 도메인", "Referring domains", "right")],
    rows: rows.map((row) => ({ ...row })),
    empty: l("연결된 참조 도메인 데이터가 없습니다", "No connected referring-domain data is available"),
  };
}

export default async function AnalyticsPage({
  params: p,
  searchParams,
}: {
  params: Promise<{ seg: string[] }>;
  searchParams: Promise<{ project?: string; domain?: string; competitor?: string; q?: string }>;
}) {
  const [{ seg }, query] = await Promise.all([p, searchParams]);
  const key = seg.join("/");
  if (!params.some((candidate) => candidate.join("/") === key)) notFound();

  const auth = await getAuth();
  if (!auth) redirect("/");
  const projectRows = await db
    .select({ id: folders.id, name: folders.name, domain: folders.domain })
    .from(folders)
    .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)));
  const normalizedQueryDomain = query.domain ? normalizeDomain(query.domain) : "";
  const project =
    projectRows.find((row) => row.id === query.project) ??
    projectRows.find((row) => normalizeDomain(row.domain) === normalizedQueryDomain) ??
    projectRows[0];
  if (!project) redirect("/home/");

  const settings = await getSeoProjectSettings(auth, project.id);
  const domain = normalizeDomain(project.domain);
  const report = await getDomainAnalytics({
    domain,
    countryCode: settings.countryCode,
    device: settings.device,
  });
  const competitorOptions = (report?.availableDomains ?? []).filter(
    (candidate) => normalizeDomain(candidate) !== domain,
  );
  const requestedCompetitor = query.competitor ? normalizeDomain(query.competitor) : "";
  const competitor = competitorOptions.includes(requestedCompetitor)
    ? requestedCompetitor
    : (competitorOptions[0] ?? "");
  const competitorReport = competitor
    ? await getDomainAnalytics({
        domain: competitor,
        countryCode: settings.countryCode,
        device: settings.device,
      })
    : null;

  const reports = (
    await Promise.all(
      (report?.availableDomains ?? [domain]).slice(0, 25).map((candidate) =>
        getDomainAnalytics({
          domain: candidate,
          countryCode: settings.countryCode,
          device: settings.device,
        }),
      ),
    )
  ).filter((item): item is DomainAnalyticsReport => Boolean(item));

  const dataset = await getAnalyticsDataset({
    countryCode: settings.countryCode,
    device: settings.device,
  });
  const keywordQuery = query.q?.trim() ?? "";
  const keywordIdeas = buildKeywordIdeas(dataset, keywordQuery);
  const keywordListRows = await db
    .select({
      name: keywordLists.name,
      mode: keywordLists.mode,
      database: keywordLists.database,
      seed: keywordLists.seed,
      status: keywordLists.status,
      keywords: sql<number>`count(${keywordListItems.id})`,
    })
    .from(keywordLists)
    .leftJoin(
      keywordListItems,
      and(eq(keywordListItems.listId, keywordLists.id), isNull(keywordListItems.deletedAt)),
    )
    .where(
      and(
        eq(keywordLists.workspaceId, auth.workspaceId),
        eq(keywordLists.folderId, project.id),
        isNull(keywordLists.deletedAt),
      ),
    )
    .groupBy(keywordLists.id);

  const data = buildPageData({
    key,
    domain,
    projectId: project.id,
    countryCode: settings.countryCode,
    device: settings.device,
    report,
    competitorReport,
    competitor,
    competitorOptions,
    reports,
    keywordQuery,
    keywordIdeas,
    keywordLists: keywordListRows.map((row) => ({ ...row, keywords: Number(row.keywords) })),
  });
  const activeHref = `/analytics/${key}/`;

  return (
    <AppShell
      activeToolkit="seo"
      activeHref={activeHref}
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
