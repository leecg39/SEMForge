import { Pool } from "pg";
import type {
  AirbyteMarketingStream,
  AirbyteRawRecord,
  AttributionRow,
  MarketingAttributionKind,
  MarketingAttributionReport,
  MarketingProvider,
  CampaignPerformanceReport,
  MarketingTrafficReport,
} from "./contracts";
import type { MarketingMartPort } from "./ports";
import { normalizeMarketingUrl } from "./rules";

interface QueryResult<T> { rows: T[] }
export interface MarketingSqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec?(sql: string): Promise<unknown>;
}

export const MARKETING_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS marketing;

CREATE TABLE IF NOT EXISTS marketing.fact_gsc_page_daily (
  workspace_id text NOT NULL, folder_id text NOT NULL, date date NOT NULL, normalized_url text NOT NULL,
  clicks double precision NOT NULL, impressions double precision NOT NULL, ctr double precision,
  position double precision, refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, folder_id, date, normalized_url)
);
CREATE TABLE IF NOT EXISTS marketing.fact_ga4_page_daily (
  workspace_id text NOT NULL, folder_id text NOT NULL, date date NOT NULL, normalized_url text NOT NULL,
  sessions double precision NOT NULL, engaged_sessions double precision NOT NULL,
  key_events double precision NOT NULL, revenue double precision NOT NULL, refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, folder_id, date, normalized_url)
);
CREATE TABLE IF NOT EXISTS marketing.fact_ad_daily (
  workspace_id text NOT NULL, folder_id text NOT NULL, provider text NOT NULL, date date NOT NULL,
  external_campaign_id text NOT NULL, campaign text, impressions double precision NOT NULL,
  clicks double precision NOT NULL, cost double precision NOT NULL, conversions double precision NOT NULL,
  revenue double precision NOT NULL, refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, folder_id, provider, date, external_campaign_id)
);
CREATE TABLE IF NOT EXISTS marketing.fact_crm_conversion (
  workspace_id text NOT NULL, folder_id text NOT NULL, date date NOT NULL,
  pseudonymous_entity_id char(64) NOT NULL, stage text, amount double precision NOT NULL,
  channel text NOT NULL, campaign text, landing_page text, attribution text NOT NULL,
  evidence jsonb NOT NULL, refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, folder_id, date, pseudonymous_entity_id)
);
CREATE TABLE IF NOT EXISTS marketing.mart_page_funnel_daily (
  workspace_id text NOT NULL, folder_id text NOT NULL, date date NOT NULL, normalized_url text NOT NULL,
  clicks double precision NOT NULL, impressions double precision NOT NULL, ctr double precision,
  position double precision, sessions double precision NOT NULL, engaged_sessions double precision NOT NULL,
  key_events double precision NOT NULL, revenue double precision NOT NULL, refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, folder_id, date, normalized_url)
);
CREATE TABLE IF NOT EXISTS marketing.mart_channel_roi_daily (
  workspace_id text NOT NULL, folder_id text NOT NULL, date date NOT NULL, channel text NOT NULL,
  sessions double precision NOT NULL, engaged_sessions double precision NOT NULL, key_events double precision NOT NULL,
  revenue double precision NOT NULL, cost double precision NOT NULL, refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, folder_id, date, channel)
);
CREATE TABLE IF NOT EXISTS marketing.mart_campaign_performance_daily (
  workspace_id text NOT NULL, folder_id text NOT NULL, provider text NOT NULL, date date NOT NULL,
  external_campaign_id text NOT NULL, campaign text, impressions double precision NOT NULL,
  clicks double precision NOT NULL, cost double precision NOT NULL, conversions double precision NOT NULL,
  revenue double precision NOT NULL, refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, folder_id, provider, date, external_campaign_id)
);
CREATE TABLE IF NOT EXISTS marketing.mart_content_performance (
  workspace_id text NOT NULL, folder_id text NOT NULL, content_id text NOT NULL, normalized_url text NOT NULL,
  period_from date NOT NULL, period_to date NOT NULL, clicks double precision NOT NULL,
  sessions double precision NOT NULL, key_events double precision NOT NULL, inferred_revenue double precision NOT NULL,
  refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, folder_id, content_id, period_from, period_to)
);
CREATE TABLE IF NOT EXISTS marketing.mart_attribution (
  workspace_id text NOT NULL, folder_id text NOT NULL, date date NOT NULL,
  pseudonymous_entity_id char(64) NOT NULL, channel text NOT NULL, campaign text,
  landing_page text, conversions double precision NOT NULL, revenue double precision NOT NULL,
  attribution text NOT NULL CHECK (attribution IN ('confirmed','inferred','unattributed')),
  evidence jsonb NOT NULL, refreshed_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, folder_id, date, pseudonymous_entity_id)
);
CREATE INDEX IF NOT EXISTS marketing_page_range_idx ON marketing.mart_page_funnel_daily (workspace_id, folder_id, date);
CREATE INDEX IF NOT EXISTS marketing_channel_range_idx ON marketing.mart_channel_roi_daily (workspace_id, folder_id, date);
CREATE INDEX IF NOT EXISTS marketing_attribution_range_idx ON marketing.mart_attribution (workspace_id, folder_id, date);
`;

/** 운영 DB에서 관리자가 한 번 적용한다. 앱 역할은 raw 스키마를 부여받지 않는다. */
export const MARKETING_ROLE_SQL = `
CREATE ROLE airbyte_writer NOLOGIN;
CREATE ROLE marketing_transformer NOLOGIN;
CREATE ROLE semforge_reader NOLOGIN;
GRANT USAGE ON SCHEMA marketing TO marketing_transformer, semforge_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA marketing TO marketing_transformer;
GRANT SELECT ON ALL TABLES IN SCHEMA marketing TO semforge_reader;
`;

export interface CanonicalMarketingBatch {
  workspaceId: string;
  folderId: string;
  refreshedAt: Date;
  gscPages: Array<{ date: string; url: string; clicks: number; impressions: number; ctr: number | null; position: number | null }>;
  ga4Pages: Array<{ date: string; url: string; sessions: number; engagedSessions: number; keyEvents: number; revenue: number }>;
  channels: Array<{ date: string; channel: string; sessions: number; engagedSessions: number; keyEvents: number; revenue: number; cost: number }>;
  campaigns: Array<{ provider: "google_ads" | "meta_ads"; date: string; externalCampaignId: string; campaign: string | null; impressions: number; clicks: number; cost: number; conversions: number; revenue: number }>;
  attribution: Array<{ date: string; pseudonymousEntityId: string; channel: string; campaign: string | null; landingPage: string | null; conversions: number; revenue: number; attribution: MarketingAttributionKind; evidence: string[] }>;
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function timestamp(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

const RAW_STREAM_TABLES: Record<MarketingProvider, Array<{ stream: AirbyteMarketingStream; candidates: string[] }>> = {
  gsc: [{ stream: "gsc_pages", candidates: ["search_analytics_by_page", "search_analytics_by_date_page", "search_analytics_by_page_date", "pages"] }],
  ga4: [
    { stream: "ga4_pages", candidates: ["pages"] },
    { stream: "ga4_traffic_sources", candidates: ["traffic_sources", "traffic_source"] },
  ],
  google_ads: [{ stream: "google_ads_campaigns", candidates: ["campaigns", "campaign"] }],
  meta_ads: [{ stream: "meta_ads_campaigns", candidates: ["ads_insights", "campaigns"] }],
  hubspot: [{ stream: "hubspot_deals", candidates: ["deals"] }],
};

function assertRawNamespace(namespace: string): void {
  if (!/^raw_[a-f0-9]{8,32}$/u.test(namespace)) throw new Error("허용되지 않은 raw namespace입니다.");
}

function rawTableName(candidates: string[], available: Set<string>): string | null {
  for (const candidate of candidates) {
    if (available.has(candidate)) return candidate;
    const legacy = `_airbyte_raw_${candidate}`;
    if (available.has(legacy)) return legacy;
  }
  return null;
}

export class PostgresMarketingAdapter implements MarketingMartPort {
  constructor(private readonly client: MarketingSqlClient) {}

  async migrate(): Promise<void> {
    if (this.client.exec) await this.client.exec(MARKETING_SCHEMA_SQL);
    else await this.client.query(MARKETING_SCHEMA_SQL);
  }

  async deleteRawNamespace(namespace: string): Promise<void> {
    assertRawNamespace(namespace);
    await this.client.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
  }

  private async listRawTables(namespace: string): Promise<Set<string>> {
    assertRawNamespace(namespace);
    const result = await this.client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE'",
      [namespace],
    );
    return new Set(result.rows.map((row) => row.table_name));
  }

  async readAirbyteRecords(input: { namespace: string; provider: MarketingProvider; limit?: number }): Promise<AirbyteRawRecord[]> {
    const tables = await this.listRawTables(input.namespace);
    const definitions = RAW_STREAM_TABLES[input.provider];
    const selected = definitions
      .map((definition) => ({ ...definition, table: rawTableName(definition.candidates, tables) }))
      .filter((definition): definition is typeof definition & { table: string } => definition.table !== null);
    if (selected.length === 0) throw new Error("지원되는 Airbyte raw 스트림 테이블을 찾을 수 없습니다.");

    const limit = Math.min(Math.max(input.limit ?? 100_000, 1), 100_000);
    const records: AirbyteRawRecord[] = [];
    for (const definition of selected) {
      const result = await this.client.query<{ data: unknown }>(
        `SELECT COALESCE(to_jsonb(t)->'_airbyte_data', to_jsonb(t)) AS data FROM "${input.namespace}"."${definition.table}" AS t LIMIT $1`,
        [limit],
      );
      for (const row of result.rows) {
        if (row.data && typeof row.data === "object" && !Array.isArray(row.data)) {
          records.push({ stream: definition.stream, data: row.data as Record<string, unknown> });
        }
      }
    }
    return records;
  }

  async purgeRetention(input: { namespace: string; provider: MarketingProvider; now?: Date }): Promise<void> {
    const now = input.now ?? new Date();
    const canonicalCutoff = new Date(now);
    canonicalCutoff.setUTCMonth(canonicalCutoff.getUTCMonth() - 25);
    for (const table of [
      "fact_gsc_page_daily", "fact_ga4_page_daily", "fact_ad_daily", "fact_crm_conversion",
      "mart_page_funnel_daily", "mart_channel_roi_daily", "mart_campaign_performance_daily", "mart_attribution",
    ]) {
      await this.client.query(`DELETE FROM marketing.${table} WHERE date < $1`, [canonicalCutoff.toISOString().slice(0, 10)]);
    }
    await this.client.query("DELETE FROM marketing.mart_content_performance WHERE period_to < $1", [canonicalCutoff.toISOString().slice(0, 10)]);

    const tables = await this.listRawTables(input.namespace);
    const rawCutoff = new Date(now.getTime() - (input.provider === "hubspot" ? 7 : 30) * 24 * 60 * 60 * 1000);
    for (const definition of RAW_STREAM_TABLES[input.provider]) {
      const table = rawTableName(definition.candidates, tables);
      if (!table) continue;
      await this.client.query(
        `DELETE FROM "${input.namespace}"."${table}" AS t
         WHERE COALESCE(
           NULLIF(to_jsonb(t)->>'_airbyte_extracted_at','')::timestamptz,
           NULLIF(to_jsonb(t)->>'_airbyte_emitted_at','')::timestamptz
         ) < $1`,
        [rawCutoff],
      );
    }
  }

  async upsertCanonicalBatch(batch: CanonicalMarketingBatch): Promise<void> {
    const pages = new Map<string, { date: string; url: string }>();
    const page = (date: string, rawUrl: string) => {
      const url = normalizeMarketingUrl(rawUrl);
      if (!url) return null;
      const key = `${date}\u0000${url}`;
      const existing = pages.get(key) ?? { date, url };
      pages.set(key, existing);
      return existing;
    };
    for (const row of batch.gscPages) {
      const target = page(row.date, row.url);
      if (!target) continue;
      await this.client.query(
        `INSERT INTO marketing.fact_gsc_page_daily VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (workspace_id,folder_id,date,normalized_url) DO UPDATE SET clicks=EXCLUDED.clicks,impressions=EXCLUDED.impressions,ctr=EXCLUDED.ctr,position=EXCLUDED.position,refreshed_at=EXCLUDED.refreshed_at`,
        [batch.workspaceId, batch.folderId, row.date, target.url, row.clicks, row.impressions, row.ctr, row.position, batch.refreshedAt],
      );
    }
    for (const row of batch.ga4Pages) {
      const target = page(row.date, row.url);
      if (!target) continue;
      await this.client.query(
        `INSERT INTO marketing.fact_ga4_page_daily VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (workspace_id,folder_id,date,normalized_url) DO UPDATE SET sessions=EXCLUDED.sessions,engaged_sessions=EXCLUDED.engaged_sessions,key_events=EXCLUDED.key_events,revenue=EXCLUDED.revenue,refreshed_at=EXCLUDED.refreshed_at`,
        [batch.workspaceId, batch.folderId, row.date, target.url, row.sessions, row.engagedSessions, row.keyEvents, row.revenue, batch.refreshedAt],
      );
    }
    for (const row of pages.values()) {
      await this.client.query(
        `INSERT INTO marketing.mart_page_funnel_daily (
           workspace_id,folder_id,date,normalized_url,clicks,impressions,ctr,position,
           sessions,engaged_sessions,key_events,revenue,refreshed_at
         )
         SELECT $1,$2,$3::date,$4,
           COALESCE(g.clicks,0),COALESCE(g.impressions,0),g.ctr,g.position,
           COALESCE(a.sessions,0),COALESCE(a.engaged_sessions,0),COALESCE(a.key_events,0),COALESCE(a.revenue,0),
           COALESCE(LEAST(g.refreshed_at,a.refreshed_at),g.refreshed_at,a.refreshed_at,$5::timestamptz)
         FROM (SELECT 1) AS marker
         LEFT JOIN marketing.fact_gsc_page_daily AS g
           ON g.workspace_id=$1 AND g.folder_id=$2 AND g.date=$3::date AND g.normalized_url=$4
         LEFT JOIN marketing.fact_ga4_page_daily AS a
           ON a.workspace_id=$1 AND a.folder_id=$2 AND a.date=$3::date AND a.normalized_url=$4
         ON CONFLICT (workspace_id,folder_id,date,normalized_url) DO UPDATE SET clicks=EXCLUDED.clicks,impressions=EXCLUDED.impressions,ctr=EXCLUDED.ctr,position=EXCLUDED.position,sessions=EXCLUDED.sessions,engaged_sessions=EXCLUDED.engaged_sessions,key_events=EXCLUDED.key_events,revenue=EXCLUDED.revenue,refreshed_at=EXCLUDED.refreshed_at`,
        [batch.workspaceId, batch.folderId, row.date, row.url, batch.refreshedAt],
      );
    }
    for (const row of batch.channels) {
      await this.client.query(
        `INSERT INTO marketing.mart_channel_roi_daily VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (workspace_id,folder_id,date,channel) DO UPDATE SET sessions=EXCLUDED.sessions,engaged_sessions=EXCLUDED.engaged_sessions,key_events=EXCLUDED.key_events,revenue=EXCLUDED.revenue,cost=EXCLUDED.cost,refreshed_at=EXCLUDED.refreshed_at`,
        [batch.workspaceId, batch.folderId, row.date, row.channel, row.sessions, row.engagedSessions, row.keyEvents, row.revenue, row.cost, batch.refreshedAt],
      );
    }
    for (const row of batch.campaigns) {
      const values = [batch.workspaceId, batch.folderId, row.provider, row.date, row.externalCampaignId, row.campaign, row.impressions, row.clicks, row.cost, row.conversions, row.revenue, batch.refreshedAt];
      await this.client.query(
        `INSERT INTO marketing.fact_ad_daily VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (workspace_id,folder_id,provider,date,external_campaign_id) DO UPDATE SET campaign=EXCLUDED.campaign,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,cost=EXCLUDED.cost,conversions=EXCLUDED.conversions,revenue=EXCLUDED.revenue,refreshed_at=EXCLUDED.refreshed_at`, values,
      );
      await this.client.query(
        `INSERT INTO marketing.mart_campaign_performance_daily VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (workspace_id,folder_id,provider,date,external_campaign_id) DO UPDATE SET campaign=EXCLUDED.campaign,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,cost=EXCLUDED.cost,conversions=EXCLUDED.conversions,revenue=EXCLUDED.revenue,refreshed_at=EXCLUDED.refreshed_at`, values,
      );
    }
    for (const row of batch.attribution) {
      const landingPage = row.landingPage ? normalizeMarketingUrl(row.landingPage) : null;
      const values = [batch.workspaceId, batch.folderId, row.date, row.pseudonymousEntityId, row.channel, row.campaign, landingPage, row.conversions, row.revenue, row.attribution, JSON.stringify(row.evidence), batch.refreshedAt];
      const factValues = [batch.workspaceId, batch.folderId, row.date, row.pseudonymousEntityId, row.channel, row.campaign, landingPage, row.revenue, row.attribution, JSON.stringify(row.evidence), batch.refreshedAt];
      await this.client.query(
        `INSERT INTO marketing.fact_crm_conversion (workspace_id,folder_id,date,pseudonymous_entity_id,stage,amount,channel,campaign,landing_page,attribution,evidence,refreshed_at)
         VALUES ($1,$2,$3,$4,NULL,$8,$5,$6,$7,$9,$10,$11)
         ON CONFLICT (workspace_id,folder_id,date,pseudonymous_entity_id) DO UPDATE SET amount=EXCLUDED.amount,channel=EXCLUDED.channel,campaign=EXCLUDED.campaign,landing_page=EXCLUDED.landing_page,attribution=EXCLUDED.attribution,evidence=EXCLUDED.evidence,refreshed_at=EXCLUDED.refreshed_at`, factValues,
      );
      await this.client.query(
        `INSERT INTO marketing.mart_attribution VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (workspace_id,folder_id,date,pseudonymous_entity_id) DO UPDATE SET channel=EXCLUDED.channel,campaign=EXCLUDED.campaign,landing_page=EXCLUDED.landing_page,conversions=EXCLUDED.conversions,revenue=EXCLUDED.revenue,attribution=EXCLUDED.attribution,evidence=EXCLUDED.evidence,refreshed_at=EXCLUDED.refreshed_at`, values,
      );
    }
  }

  async getTrafficReport(input: { workspaceId: string; folderId: string; from: string; to: string }) {
    const pages = await this.client.query<Record<string, unknown>>(
      `SELECT date,normalized_url,clicks,impressions,ctr,position,sessions,engaged_sessions,key_events,revenue,refreshed_at
       FROM marketing.mart_page_funnel_daily WHERE workspace_id=$1 AND folder_id=$2 AND date BETWEEN $3 AND $4 ORDER BY date,normalized_url`,
      [input.workspaceId, input.folderId, input.from, input.to],
    );
    const channels = await this.client.query<Record<string, unknown>>(
      `SELECT date,channel,sessions,engaged_sessions,key_events,revenue,refreshed_at
       FROM marketing.mart_channel_roi_daily WHERE workspace_id=$1 AND folder_id=$2 AND date BETWEEN $3 AND $4 ORDER BY date,channel`,
      [input.workspaceId, input.folderId, input.from, input.to],
    );
    if (pages.rows.length === 0 && channels.rows.length === 0) return null;
    const pageRows: MarketingTrafficReport["pages"] = pages.rows.map((row) => ({
      date: dateString(row.date), url: String(row.normalized_url), clicks: number(row.clicks), impressions: number(row.impressions),
      ctr: row.ctr === null ? null : number(row.ctr), position: row.position === null ? null : number(row.position),
      sessions: number(row.sessions), engagedSessions: number(row.engaged_sessions),
      engagementRate: number(row.sessions) === 0 ? null : number(row.engaged_sessions) / number(row.sessions),
      keyEvents: number(row.key_events), revenue: number(row.revenue),
    }));
    const channelRows: MarketingTrafficReport["channels"] = channels.rows.map((row) => ({
      date: dateString(row.date), channel: String(row.channel), sessions: number(row.sessions),
      engagedSessions: number(row.engaged_sessions), keyEvents: number(row.key_events), revenue: number(row.revenue),
    }));
    const fetched = [...pages.rows, ...channels.rows].map((row) => timestamp(row.refreshed_at)).sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      fetchedAt: fetched,
      overview: pageRows.reduce((sum, row) => ({
        clicks: sum.clicks + row.clicks, impressions: sum.impressions + row.impressions,
        sessions: sum.sessions + row.sessions, engagedSessions: sum.engagedSessions + row.engagedSessions,
        keyEvents: sum.keyEvents + row.keyEvents, revenue: sum.revenue + row.revenue,
      }), { clicks: 0, impressions: 0, sessions: 0, engagedSessions: 0, keyEvents: 0, revenue: 0 }),
      channels: channelRows, pages: pageRows,
    };
  }

  async getAttributionReport(input: { workspaceId: string; folderId: string; from: string; to: string }): Promise<{ fetchedAt: Date; rows: MarketingAttributionReport["rows"] } | null> {
    const result = await this.client.query<Record<string, unknown>>(
      `SELECT date,channel,campaign,landing_page,conversions,revenue,attribution,evidence,refreshed_at
       FROM marketing.mart_attribution WHERE workspace_id=$1 AND folder_id=$2 AND date BETWEEN $3 AND $4 ORDER BY date,channel`,
      [input.workspaceId, input.folderId, input.from, input.to],
    );
    if (result.rows.length === 0) return null;
    const rows: AttributionRow[] = result.rows.map((row) => ({
      date: dateString(row.date), channel: String(row.channel), campaign: row.campaign === null ? null : String(row.campaign),
      landingPage: row.landing_page === null ? null : String(row.landing_page), conversions: number(row.conversions), revenue: number(row.revenue),
      attribution: String(row.attribution) as MarketingAttributionKind,
      evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : JSON.parse(String(row.evidence)) as string[],
    }));
    return { fetchedAt: result.rows.map((row) => timestamp(row.refreshed_at)).sort((a, b) => b.getTime() - a.getTime())[0], rows };
  }

  async getCampaignReport(input: { workspaceId: string; folderId: string; from: string; to: string; provider?: "google_ads" | "meta_ads" }): Promise<{ fetchedAt: Date; rows: CampaignPerformanceReport["rows"] } | null> {
    const params: unknown[] = [input.workspaceId, input.folderId, input.from, input.to];
    const providerClause = input.provider ? " AND provider=$5" : "";
    if (input.provider) params.push(input.provider);
    const result = await this.client.query<Record<string, unknown>>(
      `SELECT provider,date,external_campaign_id,campaign,impressions,clicks,cost,conversions,revenue,refreshed_at
       FROM marketing.mart_campaign_performance_daily WHERE workspace_id=$1 AND folder_id=$2 AND date BETWEEN $3 AND $4${providerClause} ORDER BY date,campaign`, params,
    );
    if (result.rows.length === 0) return null;
    return {
      fetchedAt: result.rows.map((row) => timestamp(row.refreshed_at)).sort((a, b) => b.getTime() - a.getTime())[0],
      rows: result.rows.map((row) => {
        const cost = number(row.cost); const conversions = number(row.conversions); const revenue = number(row.revenue);
        return {
          provider: String(row.provider) as "google_ads" | "meta_ads", date: dateString(row.date),
          externalCampaignId: String(row.external_campaign_id), campaign: row.campaign === null ? null : String(row.campaign),
          impressions: number(row.impressions), clicks: number(row.clicks), cost, conversions, revenue,
          cpa: conversions === 0 ? null : cost / conversions, roas: cost === 0 ? null : revenue / cost,
        };
      }),
    };
  }
}

let pool: Pool | null = null;
let transformerPool: Pool | null = null;
export function postgresMarketingFromEnv(): PostgresMarketingAdapter | null {
  const connectionString = process.env.ANALYTICS_DATABASE_URL?.trim();
  if (!connectionString) return null;
  pool ??= new Pool({ connectionString, max: 5, application_name: "semforge_marketing_reader" });
  return new PostgresMarketingAdapter(pool);
}

export function postgresMarketingTransformerFromEnv(): PostgresMarketingAdapter | null {
  const connectionString = process.env.ANALYTICS_TRANSFORM_DATABASE_URL?.trim();
  if (!connectionString) return null;
  transformerPool ??= new Pool({ connectionString, max: 2, application_name: "semforge_marketing_transformer" });
  return new PostgresMarketingAdapter(transformerPool);
}
