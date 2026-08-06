import { createHmac, randomUUID } from "node:crypto";
import type { AuthContext } from "@/lib/session";
import { ApiError } from "@/lib/api";
import { AirbyteHttpAdapter, airbyteFromEnv } from "./airbyte";
import { marketingFlags } from "./config";
import type { MarketingProvider } from "./contracts";
import { marketingControl, completePendingMarketingConnection, consumeMarketingOauthState, createMarketingOauthState, createPendingMarketingConnection, failPendingMarketingConnection, findAirbyteWorkspace, getMarketingConnectionBinding, getMarketingConnectionRow } from "./store";

const START_DATE = "2024-01-01";

export function opaqueRawNamespace(workspaceId: string, secret: string): string {
  return `raw_${createHmac("sha256", secret).update(workspaceId).digest("hex").slice(0, 16)}`;
}

export function postgresDestinationConfiguration(connectionString: string): Record<string, unknown> {
  const url = new URL(connectionString);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new ApiError("INTERNAL", "Airbyte destination 데이터베이스 URL 형식이 올바르지 않습니다.");
  return {
    destinationType: "postgres",
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.replace(/^\//u, ""),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    schema: "airbyte_internal",
    ssl_mode: { mode: url.searchParams.get("sslmode") === "disable" ? "disable" : "require" },
  };
}

export function connectorConfiguration(provider: MarketingProvider, externalPropertyId: string): Record<string, unknown> {
  if (provider === "gsc") return { sourceType: "google-search-console", site_urls: [externalPropertyId], start_date: START_DATE };
  if (provider === "ga4") return { sourceType: "google-analytics-data-api", property_ids: [externalPropertyId], start_date: START_DATE };
  if (provider === "google_ads") return { sourceType: "google-ads", customer_id: externalPropertyId, start_date: START_DATE };
  if (provider === "meta_ads") return { sourceType: "facebook-marketing", account_ids: [externalPropertyId], start_date: START_DATE };
  return { sourceType: "hubspot", start_date: `${START_DATE}T00:00:00Z` };
}

function sourceType(provider: MarketingProvider): string {
  return String(connectorConfiguration(provider, "pending").sourceType);
}

export function connectionStreamNames(provider: MarketingProvider): string[] {
  if (provider === "gsc") return [
    "search_analytics_by_date", "search_analytics_by_page", "search_analytics_by_query",
    "search_analytics_by_date_page", "search_analytics_by_page_date",
  ];
  if (provider === "ga4") return ["pages", "traffic_sources", "website_overview"];
  if (provider === "google_ads") return ["campaigns", "campaigns_conversion_value", "campaigns_conversion_window"];
  if (provider === "meta_ads") return ["ads_insights", "campaigns"];
  return ["deals", "companies", "contacts", "campaigns"];
}

function oauthProvider(provider: MarketingProvider): "google" | "meta" | "hubspot" {
  if (["gsc", "ga4", "google_ads"].includes(provider)) return "google";
  return provider === "meta_ads" ? "meta" : "hubspot";
}

function oauthOverride(provider: MarketingProvider): Record<string, unknown> | null {
  if (["gsc", "ga4", "google_ads"].includes(provider)) {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    return clientId && clientSecret ? { client_id: clientId, client_secret: clientSecret } : null;
  }
  if (provider === "meta_ads") {
    const clientId = process.env.META_APP_ID?.trim();
    const clientSecret = process.env.META_APP_SECRET?.trim();
    return clientId && clientSecret ? { client_id: clientId, client_secret: clientSecret } : null;
  }
  const clientId = process.env.HUBSPOT_CLIENT_ID?.trim();
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { client_id: clientId, client_secret: clientSecret } : null;
}

function publicBaseUrl(): string {
  const value = process.env.APP_PUBLIC_URL?.trim();
  if (!value) throw new ApiError("INTERNAL", "APP_PUBLIC_URL이 설정되지 않았습니다.");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new ApiError("VALIDATION_ERROR", "Airbyte OAuth 연결에는 HTTPS APP_PUBLIC_URL이 필요합니다.");
  return url.origin;
}

function requireProvisioning() {
  if (!marketingFlags.ingestion() || !marketingFlags.selfService()) throw new ApiError("FORBIDDEN", "마케팅 데이터 셀프서비스 연결이 비활성화되어 있습니다.");
  const adapter = airbyteFromEnv();
  const organizationId = process.env.AIRBYTE_ORGANIZATION_ID?.trim();
  const databaseUrl = process.env.AIRBYTE_DESTINATION_DATABASE_URL?.trim();
  if (!adapter || !organizationId || !databaseUrl) throw new ApiError("INTERNAL", "Airbyte 또는 분석 데이터베이스 구성이 완료되지 않았습니다.");
  return { adapter, organizationId, databaseUrl };
}

function requireMutationRole(auth: AuthContext) {
  if (auth.role === "viewer") throw new ApiError("FORBIDDEN", "읽기 전용 멤버는 데이터 연결을 변경할 수 없습니다.");
}

async function ensureAirbyteTenant(adapter: AirbyteHttpAdapter, auth: AuthContext, organizationId: string, databaseUrl: string) {
  const existing = await findAirbyteWorkspace(auth.workspaceId);
  let workspaceId = existing?.workspaceId;
  let destinationId = existing?.destinationId;
  if (!workspaceId) workspaceId = (await adapter.createWorkspace({ name: `SEMForge ${auth.workspaceId}`, organizationId })).workspaceId;
  if (!destinationId) {
    destinationId = (await adapter.createDestination({
      workspaceId, name: "SEMForge marketing raw", configuration: postgresDestinationConfiguration(databaseUrl),
    })).destinationId;
  }
  return { workspaceId, destinationId };
}

export async function beginMarketingConnection(auth: AuthContext, input: {
  folderId: string; provider: MarketingProvider; externalPropertyId: string; returnTo?: string;
}) {
  requireMutationRole(auth);
  await marketingControl.assertFolder(auth.workspaceId, input.folderId);
  if (["google_ads", "meta_ads"].includes(input.provider) && !marketingFlags.ads()) throw new ApiError("FORBIDDEN", "광고 데이터 연결이 비활성화되어 있습니다.");
  if (input.provider === "hubspot" && !marketingFlags.crm()) throw new ApiError("FORBIDDEN", "CRM 데이터 연결이 비활성화되어 있습니다.");
  const { adapter, organizationId, databaseUrl } = requireProvisioning();
  const tenant = await ensureAirbyteTenant(adapter, auth, organizationId, databaseUrl);
  const namespace = opaqueRawNamespace(
    `${auth.workspaceId}:${input.provider}:${input.externalPropertyId}:${randomUUID()}`,
    process.env.APP_SECRET?.trim() || "semforge-local-development",
  );
  const localConnectionId = await createPendingMarketingConnection({
    workspaceId: auth.workspaceId, folderId: input.folderId, provider: input.provider,
    airbyteWorkspaceId: tenant.workspaceId, airbyteDestinationId: tenant.destinationId,
    rawNamespace: namespace, externalPropertyId: input.externalPropertyId,
  });
  const state = await createMarketingOauthState({
    provider: oauthProvider(input.provider), workspaceId: auth.workspaceId, folderId: input.folderId,
    returnTo: input.returnTo?.startsWith("/analytics/") ? input.returnTo : "/analytics/traffic/sources-destinations/",
  });
  const callback = new URL("/api/marketing/connections/oauth/callback/", publicBaseUrl());
  callback.searchParams.set("state", state);
  callback.searchParams.set("connection", localConnectionId);
  callback.searchParams.set("property", input.externalPropertyId);
  const override = oauthOverride(input.provider);
  try {
    if (override) await adapter.setWorkspaceOAuthCredentials({ workspaceId: tenant.workspaceId, sourceType: sourceType(input.provider), configuration: override });
    const result = await adapter.initiateSourceOAuth({ workspaceId: tenant.workspaceId, sourceType: sourceType(input.provider), redirectUrl: callback.toString() });
    return { redirectUrl: result.redirectUrl, connectionId: localConnectionId };
  } catch (error) {
    await failPendingMarketingConnection(auth.workspaceId, localConnectionId, "OAUTH_START_FAILED");
    throw error;
  }
}

export async function finishMarketingConnection(auth: AuthContext, input: {
  state: string; secretId: string; localConnectionId: string; externalPropertyId: string;
}) {
  requireMutationRole(auth);
  const state = await consumeMarketingOauthState(input.state, auth.workspaceId);
  const row = await getMarketingConnectionRow(auth.workspaceId, input.localConnectionId);
  const binding = await getMarketingConnectionBinding(auth.workspaceId, input.localConnectionId);
  if (!row || !binding || binding.folderId !== state.folderId || binding.externalPropertyId !== input.externalPropertyId || row.status !== "pending" || !row.airbyteWorkspaceId || !row.airbyteDestinationId || !row.rawNamespace) {
    throw new ApiError("NOT_FOUND", "완료할 마케팅 연결을 찾을 수 없습니다.");
  }
  const { adapter } = requireProvisioning();
  let sourceId: string | null = null;
  try {
    sourceId = (await adapter.createSource({
      workspaceId: row.airbyteWorkspaceId,
      name: `${row.provider} · ${auth.workspaceId}`,
      configuration: connectorConfiguration(row.provider, input.externalPropertyId),
      secretId: input.secretId,
    })).sourceId;
    const connection = await adapter.createConnection({
      sourceId, destinationId: row.airbyteDestinationId,
      name: `${row.provider} · ${auth.workspaceId}`, namespace: row.rawNamespace,
      streamNames: connectionStreamNames(row.provider),
    });
    await completePendingMarketingConnection({ workspaceId: auth.workspaceId, id: row.id, sourceId, connectionId: connection.connectionId });
    return { connectionId: row.id, returnTo: state.returnTo };
  } catch (error) {
    if (sourceId) await adapter.deleteSource(sourceId).catch(() => undefined);
    await failPendingMarketingConnection(auth.workspaceId, row.id, "PROVISION_FAILED");
    throw error;
  }
}
