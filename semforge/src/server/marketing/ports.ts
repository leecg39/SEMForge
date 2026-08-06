import type { CampaignPerformanceReport, MarketingAttributionReport, MarketingProvider, MarketingTrafficReport } from "./contracts";

export interface StoredMarketingConnection {
  id: string;
  workspaceId: string;
  provider: MarketingProvider;
  status: "pending" | "active" | "syncing" | "error" | "disconnected";
  airbyteSourceId: string | null;
  airbyteConnectionId: string | null;
  rawNamespace: string | null;
  lastAttemptedAt: Date | null;
  lastSucceededAt: Date | null;
  errorCode: string | null;
}

export interface MarketingControlPort {
  assertFolder(workspaceId: string, folderId: string): Promise<void>;
  listConnections(workspaceId: string, folderId: string): Promise<StoredMarketingConnection[]>;
  getConnection(workspaceId: string, connectionId: string): Promise<StoredMarketingConnection | null>;
  createSyncRun(input: { workspaceId: string; connectionId: string; airbyteJobId: string }): Promise<void>;
  disconnect(workspaceId: string, connectionId: string): Promise<void>;
}

export interface MarketingMartPort {
  getTrafficReport(input: { workspaceId: string; folderId: string; from: string; to: string }): Promise<{
    fetchedAt: Date;
    overview: Omit<MarketingTrafficReport["overview"], "engagementRate" | "clickSessionRatio">;
    channels: MarketingTrafficReport["channels"];
    pages: MarketingTrafficReport["pages"];
  } | null>;
  getAttributionReport(input: { workspaceId: string; folderId: string; from: string; to: string }): Promise<{
    fetchedAt: Date;
    rows: MarketingAttributionReport["rows"];
  } | null>;
  getCampaignReport(input: { workspaceId: string; folderId: string; from: string; to: string; provider?: "google_ads" | "meta_ads" }): Promise<{
    fetchedAt: Date;
    rows: CampaignPerformanceReport["rows"];
  } | null>;
}

export interface MarketingRawAdminPort {
  deleteRawNamespace(namespace: string): Promise<void>;
}

export interface AirbytePort {
  hasActiveJob(connectionId: string): Promise<boolean>;
  triggerSync(connectionId: string): Promise<{ jobId: string | number; status: string }>;
  deleteConnection(connectionId: string): Promise<void>;
  deleteSource(sourceId: string): Promise<void>;
}
