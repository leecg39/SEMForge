import type { AirbyteRawRecord } from "./contracts";
import type { CanonicalMarketingBatch } from "./postgres";
import { attributionKind, pseudonymizeMarketingId } from "./rules";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function date(data: Record<string, unknown>): string {
  return text(data.date || data.day).slice(0, 10);
}

export function canonicalBatchFromAirbyte(input: {
  workspaceId: string;
  folderId: string;
  secret: string;
  records: AirbyteRawRecord[];
  refreshedAt: Date;
}): CanonicalMarketingBatch {
  const batch: CanonicalMarketingBatch = {
    workspaceId: input.workspaceId, folderId: input.folderId, refreshedAt: input.refreshedAt,
    gscPages: [], ga4Pages: [], channels: [], campaigns: [], attribution: [],
  };
  for (const record of input.records) {
    const row = record.data;
    const rowDate = date(row);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(rowDate)) continue;
    if (record.stream === "gsc_pages") {
      const url = text(row.page || row.url);
      if (url) batch.gscPages.push({ date: rowDate, url, clicks: number(row.clicks), impressions: number(row.impressions), ctr: nullableNumber(row.ctr), position: nullableNumber(row.position) });
      continue;
    }
    if (record.stream === "ga4_pages") {
      const url = text(row.page_location || row.page || row.url);
      if (url) batch.ga4Pages.push({ date: rowDate, url, sessions: number(row.sessions), engagedSessions: number(row.engaged_sessions), keyEvents: number(row.key_events), revenue: number(row.total_revenue || row.revenue) });
      continue;
    }
    if (record.stream === "ga4_traffic_sources") {
      batch.channels.push({ date: rowDate, channel: text(row.session_default_channel_group || row.channel) || "Unassigned", sessions: number(row.sessions), engagedSessions: number(row.engaged_sessions), keyEvents: number(row.key_events), revenue: number(row.total_revenue || row.revenue), cost: 0 });
      continue;
    }
    if (record.stream === "google_ads_campaigns" || record.stream === "meta_ads_campaigns") {
      const externalCampaignId = text(row.campaign_id || row.id);
      if (!externalCampaignId) continue;
      batch.campaigns.push({
        provider: record.stream === "google_ads_campaigns" ? "google_ads" : "meta_ads",
        date: rowDate, externalCampaignId, campaign: text(row.campaign_name || row.name) || null,
        impressions: number(row.impressions), clicks: number(row.clicks), cost: number(row.cost || row.spend),
        conversions: number(row.conversions || row.actions), revenue: number(row.conversion_value || row.revenue),
      });
      continue;
    }
    const entityId = text(row.id || row.deal_id);
    if (!entityId) continue;
    const gclid = text(row.gclid) || null;
    const utmSource = text(row.utm_source) || null;
    const crmSource = text(row.crm_source || row.original_source) || null;
    const attribution = attributionKind({ gclid, utmSource, crmSource });
    const evidence = [gclid ? "gclid" : null, utmSource ? "utm" : null, crmSource ? "crm_source" : null].filter((value): value is string => value !== null);
    batch.attribution.push({
      date: rowDate, pseudonymousEntityId: pseudonymizeMarketingId(entityId, `${input.secret}:${input.workspaceId}`),
      channel: utmSource || crmSource || "unattributed", campaign: text(row.utm_campaign || row.campaign) || null,
      landingPage: text(row.landing_page || row.first_page_seen) || null,
      conversions: 1, revenue: number(row.amount || row.revenue), attribution, evidence,
    });
  }
  return batch;
}
