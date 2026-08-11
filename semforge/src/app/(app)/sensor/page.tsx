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
import { buildSerpVolatility } from "@/lib/seo-tools";
import { getAuth } from "@/lib/session";
import { getAnalyticsDataset } from "@/server/analytics";
import { getSeoProjectSettings } from "@/server/seo-projects/settings";

/** 프로젝트별 실측 SERP 변동성 화면은 로그인 앱 레이아웃에서 렌더링한다. */
export const dynamic = "force-dynamic";
export const metadata = { title: "Sensor | SEMForge" };

export default async function SensorPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; domain?: string }>;
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
  const dataset = await getAnalyticsDataset({
    countryCode: settings.countryCode,
    device: settings.device,
  });
  const scopedMetricIds = new Set(dataset.keywords.map((row) => row.id));
  const scopedSnapshots = dataset.serp.filter(
    (row) =>
      scopedMetricIds.has(row.keywordMetricId) &&
      row.searchEngine === settings.searchEngine &&
      !row.isAd,
  );
  const rows = buildSerpVolatility(dataset, settings.searchEngine);
  const comparedUrls = rows.reduce((sum, row) => sum + row.comparedUrls, 0);
  const movedUrls = rows.reduce((sum, row) => sum + row.movedUrls, 0);
  const averageMovement =
    comparedUrls > 0
      ? rows.reduce(
          (sum, row) =>
            sum + (row.averagePositionMovement ?? 0) * row.comparedUrls,
          0,
        ) / comparedUrls
      : null;
  const latestCapturedAt = scopedSnapshots.reduce<number | null>((latest, row) => {
    const capturedAt = new Date(row.capturedAt).getTime();
    if (!Number.isFinite(capturedAt)) return latest;
    return latest === null || capturedAt > latest ? capturedAt : latest;
  }, null);
  const domain = normalizeDomain(project.domain);
  const data: SeoLiveAnalysisData = {
    title: { ko: "Sensor", en: "Sensor" },
    description: {
      ko: "키워드별 최근 두 실제 SERP 스냅샷에 공통으로 존재하는 URL의 절대 순위 이동을 계산합니다. 새로 등장하거나 사라진 URL에는 임의 순위를 부여하지 않습니다.",
      en: "Calculates absolute position movement for URLs shared by the two latest observed SERP snapshots per keyword. No substitute rank is assigned to appearing or disappearing URLs.",
    },
    domain,
    projectId: project.id,
    countryCode: settings.countryCode,
    device: settings.device,
    sourceUpdatedAt:
      latestCapturedAt === null ? null : new Date(latestCapturedAt).toISOString(),
    sourceRecords: scopedSnapshots.length,
    metrics: [
      { label: { ko: "비교 키워드", en: "Compared keywords" }, value: rows.length },
      { label: { ko: "비교 URL", en: "Compared URLs" }, value: comparedUrls },
      { label: { ko: "순위 이동 URL", en: "Moved URLs" }, value: movedUrls },
      {
        label: { ko: "평균 절대 이동", en: "Average absolute movement" },
        value: averageMovement,
      },
    ],
    columns: [
      { key: "keyword", label: { ko: "키워드", en: "Keyword" } },
      { key: "previousCapturedAt", label: { ko: "이전 수집", en: "Previous capture" } },
      { key: "latestCapturedAt", label: { ko: "최근 수집", en: "Latest capture" } },
      { key: "comparedUrls", label: { ko: "비교 URL", en: "Compared URLs" }, align: "right" },
      { key: "movedUrls", label: { ko: "이동 URL", en: "Moved URLs" }, align: "right" },
      { key: "averagePositionMovement", label: { ko: "평균 이동", en: "Average movement" }, align: "right" },
    ],
    rows: rows.map((row) => ({ ...row })),
    empty: {
      ko: "같은 키워드의 비교 가능한 최근 두 SERP 스냅샷이 없습니다",
      en: "No two comparable recent SERP snapshots exist for the same keyword",
    },
  };

  return (
    <AppShell
      activeToolkit="seo"
      activeHref="/sensor/"
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
