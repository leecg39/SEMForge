import type { AuthContext } from "@/lib/session";
import { ApiError } from "@/lib/api";
import type {
  AttributionRange,
  CampaignPerformanceReport,
  MarketingAttributionReport,
  MarketingConnectionView,
  MarketingSection,
  MarketingTrafficReport,
  TrafficRange,
} from "./contracts";
import type { AirbytePort, MarketingControlPort, MarketingMartPort, MarketingRawAdminPort } from "./ports";
import { calculateKpis, classifyFreshness, MARKETING_STALE_MAX_MS } from "./rules";

export interface MarketingIntelligenceDependencies {
  control: MarketingControlPort;
  mart: MarketingMartPort;
  rawAdmin?: MarketingRawAdminPort | null;
  airbyte?: AirbytePort | null;
  now?: () => Date;
}

function expiresAt(fetchedAt: Date): string {
  return new Date(fetchedAt.getTime() + MARKETING_STALE_MAX_MS).toISOString();
}

function unavailable<T>(reason: string, now: Date, source: string[]): MarketingSection<T> {
  return {
    status: "unavailable", cache: "stale", measurement: "absolute", source,
    fetchedAt: now.toISOString(), expiresAt: now.toISOString(), reason,
  };
}

function assertRange(range: { from: string; to: string }) {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(range.from) || !validDate(range.to) || range.from > range.to) {
    throw new ApiError("VALIDATION_ERROR", "조회 기간을 확인해 주세요.");
  }
}

function effectiveFetchedAt(
  fallback: Date,
  connections: Awaited<ReturnType<MarketingControlPort["listConnections"]>>,
  providers: Array<"gsc" | "ga4" | "google_ads" | "meta_ads" | "hubspot">,
): Date {
  const providerSet = new Set(providers);
  const completed = connections
    .filter((connection) => providerSet.has(connection.provider) && connection.lastSucceededAt)
    .map((connection) => connection.lastSucceededAt as Date);
  return completed.length === 0
    ? fallback
    : completed.reduce((oldest, value) => value.getTime() < oldest.getTime() ? value : oldest);
}

export function createMarketingIntelligence(dependencies: MarketingIntelligenceDependencies) {
  const now = dependencies.now ?? (() => new Date());

  return {
    async getConnectionSummary(auth: AuthContext, folderId: string): Promise<MarketingConnectionView[]> {
      await dependencies.control.assertFolder(auth.workspaceId, folderId);
      const current = now();
      return (await dependencies.control.listConnections(auth.workspaceId, folderId)).map((row) => ({
        id: row.id,
        provider: row.provider,
        status: row.status,
        lastAttemptedAt: row.lastAttemptedAt?.toISOString() ?? null,
        lastSucceededAt: row.lastSucceededAt?.toISOString() ?? null,
        nextSyncAt: row.lastSucceededAt ? new Date(row.lastSucceededAt.getTime() + 60 * 60 * 1000).toISOString() : null,
        cache: row.lastSucceededAt ? classifyFreshness(row.lastSucceededAt, current) : "expired",
        ...(row.errorCode ? { reason: "최근 동기화에 실패했습니다. 연결 상태를 확인해 주세요." } : {}),
      }));
    },

    async getTrafficReport(auth: AuthContext, folderId: string, range: TrafficRange): Promise<MarketingSection<MarketingTrafficReport>> {
      assertRange(range);
      await dependencies.control.assertFolder(auth.workspaceId, folderId);
      const current = now();
      const report = await dependencies.mart.getTrafficReport({ workspaceId: auth.workspaceId, folderId, from: range.from, to: range.to });
      if (!report) return unavailable("동기화된 GA4·GSC 마트가 없습니다.", current, ["airbyte"]);
      const connections = await dependencies.control.listConnections(auth.workspaceId, folderId);
      const fetchedAt = effectiveFetchedAt(report.fetchedAt, connections, ["gsc", "ga4"]);
      const freshness = classifyFreshness(fetchedAt, current);
      if (freshness === "expired") {
        return unavailable("마지막 동기화가 24시간을 초과했습니다. 새 동기화를 실행해 주세요.", current, ["airbyte"]);
      }
      const overview = {
        ...report.overview,
        engagementRate: report.overview.sessions === 0 ? null : report.overview.engagedSessions / report.overview.sessions,
        clickSessionRatio: calculateKpis({ clicks: report.overview.clicks, sessions: report.overview.sessions, cost: 0, conversions: 0, revenue: report.overview.revenue }).clickSessionRatio,
      };
      return {
        status: "live", cache: freshness, measurement: "calculated",
        source: ["airbyte:google-analytics-data-api", "airbyte:google-search-console"],
        fetchedAt: fetchedAt.toISOString(), expiresAt: expiresAt(fetchedAt),
        ...(freshness === "stale" ? { reason: "최근 동기화가 지연되어 저장된 데이터를 표시합니다." } : {}),
        data: { overview, channels: report.channels, pages: report.pages },
      };
    },

    async getAttributionReport(auth: AuthContext, folderId: string, range: AttributionRange): Promise<MarketingSection<MarketingAttributionReport>> {
      assertRange(range);
      await dependencies.control.assertFolder(auth.workspaceId, folderId);
      const current = now();
      const report = await dependencies.mart.getAttributionReport({ workspaceId: auth.workspaceId, folderId, from: range.from, to: range.to });
      if (!report) return unavailable("동기화된 귀속 데이터가 없습니다.", current, ["airbyte:hubspot"]);
      const connections = await dependencies.control.listConnections(auth.workspaceId, folderId);
      const fetchedAt = effectiveFetchedAt(report.fetchedAt, connections, ["hubspot"]);
      const freshness = classifyFreshness(fetchedAt, current);
      if (freshness === "expired") return unavailable("귀속 데이터가 24시간 이상 지연되었습니다.", current, ["airbyte:hubspot"]);
      return {
        status: "live", cache: freshness, measurement: "inferred", source: ["airbyte:hubspot", "semforge:attribution"],
        fetchedAt: fetchedAt.toISOString(), expiresAt: expiresAt(fetchedAt), data: { rows: report.rows },
      };
    },

    async getCampaignPerformance(auth: AuthContext, folderId: string, range: AttributionRange & { provider?: "google_ads" | "meta_ads" }): Promise<MarketingSection<CampaignPerformanceReport>> {
      assertRange(range);
      await dependencies.control.assertFolder(auth.workspaceId, folderId);
      const current = now();
      const report = await dependencies.mart.getCampaignReport({ workspaceId: auth.workspaceId, folderId, from: range.from, to: range.to, provider: range.provider });
      if (!report) return unavailable("동기화된 광고 성과 데이터가 없습니다.", current, ["airbyte:advertising"]);
      const connections = await dependencies.control.listConnections(auth.workspaceId, folderId);
      const providers = range.provider ? [range.provider] : ["google_ads", "meta_ads"] as const;
      const fetchedAt = effectiveFetchedAt(report.fetchedAt, connections, [...providers]);
      const freshness = classifyFreshness(fetchedAt, current);
      if (freshness === "expired") return unavailable("광고 성과 데이터가 24시간 이상 지연되었습니다.", current, ["airbyte:advertising"]);
      return {
        status: "live", cache: freshness, measurement: "calculated",
        source: range.provider === "meta_ads" ? ["airbyte:facebook-marketing"] : range.provider === "google_ads" ? ["airbyte:google-ads"] : ["airbyte:google-ads", "airbyte:facebook-marketing"],
        fetchedAt: fetchedAt.toISOString(), expiresAt: expiresAt(fetchedAt), data: { rows: report.rows },
      };
    },

    async requestSync(auth: AuthContext, connectionId: string) {
      if (auth.role === "viewer") throw new ApiError("FORBIDDEN", "읽기 전용 멤버는 동기화를 실행할 수 없습니다.");
      const connection = await dependencies.control.getConnection(auth.workspaceId, connectionId);
      if (!connection) throw new ApiError("NOT_FOUND", "마케팅 연결을 찾을 수 없습니다.");
      if (!connection.airbyteConnectionId || !dependencies.airbyte) {
        throw new ApiError("INTERNAL", "Airbyte 동기화를 사용할 수 없습니다.");
      }
      if (await dependencies.airbyte.hasActiveJob(connection.airbyteConnectionId)) {
        throw new ApiError("DUPLICATE", "이미 동기화가 실행 중입니다.");
      }
      const job = await dependencies.airbyte.triggerSync(connection.airbyteConnectionId);
      await dependencies.control.createSyncRun({ workspaceId: auth.workspaceId, connectionId, airbyteJobId: String(job.jobId) });
      return { jobId: String(job.jobId), status: job.status };
    },

    async disconnect(auth: AuthContext, connectionId: string) {
      if (auth.role === "viewer") throw new ApiError("FORBIDDEN", "읽기 전용 멤버는 연결을 삭제할 수 없습니다.");
      const connection = await dependencies.control.getConnection(auth.workspaceId, connectionId);
      if (!connection) throw new ApiError("NOT_FOUND", "마케팅 연결을 찾을 수 없습니다.");
      if (connection.rawNamespace) {
        if (!dependencies.rawAdmin) throw new ApiError("INTERNAL", "raw 데이터 삭제 권한이 구성되지 않았습니다.");
        await dependencies.rawAdmin.deleteRawNamespace(connection.rawNamespace);
      }
      if (connection.airbyteConnectionId && dependencies.airbyte) await dependencies.airbyte.deleteConnection(connection.airbyteConnectionId);
      if (connection.airbyteSourceId && dependencies.airbyte) await dependencies.airbyte.deleteSource(connection.airbyteSourceId);
      await dependencies.control.disconnect(auth.workspaceId, connectionId);
    },
  };
}

export type MarketingIntelligence = ReturnType<typeof createMarketingIntelligence>;
