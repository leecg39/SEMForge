// @TASK P4-F1-T1 - Browser-side API v1 product contracts
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx

export type ApiErrorPayload = {
  readonly code?: string;
  readonly message?: string;
  readonly fields?: Readonly<Record<string, string>>;
};

export type ApiEnvelope<T> =
  | { readonly data: T; readonly error: null; readonly requestId: string }
  | { readonly data: null; readonly error: ApiErrorPayload; readonly requestId: string };

export interface SiteView {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly timezone: string;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SitesPageView {
  readonly items: readonly SiteView[];
  readonly nextCursor: string | null;
}

export type TrackingType = "rank" | "aio";

export interface TrackingView {
  readonly id: string;
  readonly siteId: string;
  readonly type: TrackingType;
  readonly query: string;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly collection: {
    readonly engine: "google";
    readonly country: "KR";
    readonly language: "ko";
    readonly device: "desktop";
    readonly depth: 100;
  };
}

export interface GscBindingView {
  readonly id: string;
  readonly siteId: string;
  readonly connectionId: string;
  readonly propertyUri: string;
  readonly createdAt: string;
}

export interface SiteDetailViewModel {
  readonly site: SiteView;
  readonly tracking: {
    readonly rank: readonly TrackingView[];
    readonly aio: readonly TrackingView[];
  };
  readonly gscBinding: GscBindingView | null;
}

export const REPORT_STATUSES = [
  "collecting",
  "snapshot_ready",
  "rendering",
  "delivered",
  "partial",
  "failed",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_SECTION_KEYS = ["rank", "aio", "naver", "gsc"] as const;
export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

export interface ReportSectionView {
  readonly key: ReportSectionKey;
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly capturedAt: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ReportSummaryView {
  readonly id: string;
  readonly siteId: string;
  readonly status: ReportStatus;
  readonly period: {
    readonly start: string;
    readonly end: string;
    readonly comparisonStart: string;
    readonly comparisonEnd: string;
  };
  readonly brand: BrandingView;
  readonly snapshotReadyAt: string | null;
  readonly deliveredAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReportsPageView {
  readonly items: readonly ReportSummaryView[];
  readonly nextCursor: string | null;
}

export interface ReportDetailViewModel extends ReportSummaryView {
  readonly snapshot: {
    readonly version: 1;
    readonly capturedAt: string;
    readonly schedule: {
      readonly timezone: "Asia/Seoul";
      readonly collectionAt: string;
      readonly retryCutoffAt: string;
      readonly snapshotAt: string;
    };
    readonly period: {
      readonly timezone: "America/Los_Angeles";
      readonly current: { readonly start: string; readonly end: string };
      readonly comparison: { readonly start: string; readonly end: string };
    };
    readonly brand: BrandingView;
    readonly sections: Readonly<Record<ReportSectionKey, ReportSectionView>>;
  };
}

export const SUBSCRIPTION_STATUSES = [
  "invited",
  "account_created",
  "billing_authorized",
  "charge_pending",
  "active",
  "past_due",
  "cancel_at_period_end",
  "canceled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface BillingSummaryViewModel {
  readonly status: SubscriptionStatus;
  readonly amountKrw: number;
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
  readonly graceEndsAt: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly nextRetryAt: string | null;
  readonly policy: {
    readonly timing: "period_end";
    readonly proratedRefund: false;
    readonly statutoryExceptionsApply: true;
    readonly notice: string;
  };
}

export interface BrandingView {
  readonly name: string;
  readonly logoUrl: string | null;
  readonly accentColor: string;
}

export interface GscConnectionView {
  readonly id: string;
  readonly label: string;
  readonly tokenExpiresAt: string;
  readonly scope: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GscConnectionsView {
  readonly items: readonly GscConnectionView[];
}

export interface GscConnectResultView {
  readonly authorizationUrl: string;
  readonly expiresAt: string;
}

export interface GscPropertyView {
  readonly siteUrl: string;
  readonly permissionLevel: string;
}

export interface GscPropertiesView {
  readonly items: readonly GscPropertyView[];
}

export interface ProductAccess {
  readonly canWrite: boolean;
  readonly pastReportsOnly: boolean;
  readonly reason: SubscriptionStatus | "subscription_unavailable";
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseRecordContract(value: unknown): Readonly<Record<string, unknown>> | null {
  return record(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableText(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" && value.length > 0 ? value : undefined;
}

function isoText(value: unknown): string | null {
  const parsed = text(value);
  return parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
}

function calendarDate(value: unknown): string | null {
  const parsed = text(value);
  return parsed && /^\d{4}-\d{2}-\d{2}$/u.test(parsed) ? parsed : null;
}

function id(value: unknown): string | null {
  const parsed = text(value);
  return parsed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(parsed)
    ? parsed
    : null;
}

function parseBranding(value: unknown): BrandingView | null {
  const source = record(value);
  if (!source) return null;
  const name = text(source.name);
  const logoUrl = nullableText(source.logoUrl);
  const accentColor = text(source.accentColor);
  if (!name || logoUrl === undefined || !accentColor || !/^#[0-9a-f]{6}$/iu.test(accentColor)) return null;
  if (logoUrl !== null) {
    try {
      if (new URL(logoUrl).protocol !== "https:") return null;
    } catch {
      return null;
    }
  }
  return { name, logoUrl, accentColor };
}

export function parseBrandingContract(value: unknown): BrandingView | null {
  return parseBranding(value);
}

export function parseSite(value: unknown): SiteView | null {
  const source = record(value);
  if (!source) return null;
  const siteId = id(source.id);
  const name = text(source.name);
  const domain = text(source.domain);
  const timezone = text(source.timezone);
  const createdAt = isoText(source.createdAt);
  const updatedAt = isoText(source.updatedAt);
  if (!siteId || !name || !domain || !timezone || typeof source.active !== "boolean" || !createdAt || !updatedAt) return null;
  return { id: siteId, name, domain, timezone, active: source.active, createdAt, updatedAt };
}

export function parseSitesPage(value: unknown): SitesPageView | null {
  const source = record(value);
  if (!source || !Array.isArray(source.items)) return null;
  const items = source.items.map(parseSite);
  const nextCursor = nullableText(source.nextCursor);
  if (items.some((item) => item === null) || nextCursor === undefined) return null;
  return { items: items as SiteView[], nextCursor };
}

function parseTracking(value: unknown, expectedType: TrackingType): TrackingView | null {
  const source = record(value);
  const collection = record(source?.collection);
  if (!source || !collection) return null;
  const trackingId = id(source.id);
  const siteId = id(source.siteId);
  const query = text(source.query);
  const createdAt = isoText(source.createdAt);
  const updatedAt = isoText(source.updatedAt);
  if (
    !trackingId ||
    !siteId ||
    source.type !== expectedType ||
    !query ||
    typeof source.active !== "boolean" ||
    !createdAt ||
    !updatedAt ||
    collection.engine !== "google" ||
    collection.country !== "KR" ||
    collection.language !== "ko" ||
    collection.device !== "desktop" ||
    collection.depth !== 100
  ) return null;
  return {
    id: trackingId,
    siteId,
    type: expectedType,
    query,
    active: source.active,
    createdAt,
    updatedAt,
    collection: { engine: "google", country: "KR", language: "ko", device: "desktop", depth: 100 },
  };
}

export function parseTrackingContract(value: unknown): TrackingView | null {
  const source = record(value);
  return source?.type === "rank"
    ? parseTracking(value, "rank")
    : source?.type === "aio"
      ? parseTracking(value, "aio")
      : null;
}

function parseGscBinding(value: unknown): GscBindingView | null {
  const source = record(value);
  if (!source) return null;
  const bindingId = id(source.id);
  const siteId = id(source.siteId);
  const connectionId = id(source.connectionId);
  const propertyUri = text(source.propertyUri);
  const createdAt = isoText(source.createdAt);
  if (!bindingId || !siteId || !connectionId || !propertyUri || !createdAt) return null;
  return { id: bindingId, siteId, connectionId, propertyUri, createdAt };
}

export function parseGscBindingContract(value: unknown): GscBindingView | null {
  return parseGscBinding(value);
}

export function parseSiteDetail(value: unknown): SiteDetailViewModel | null {
  const source = record(value);
  const tracking = record(source?.tracking);
  const site = parseSite(source?.site);
  if (!source || !tracking || !site || !Array.isArray(tracking.rank) || !Array.isArray(tracking.aio)) return null;
  const rank = tracking.rank.map((item) => parseTracking(item, "rank"));
  const aio = tracking.aio.map((item) => parseTracking(item, "aio"));
  if (rank.some((item) => item === null) || aio.some((item) => item === null)) return null;
  const binding = source.gscBinding === null ? null : parseGscBinding(source.gscBinding);
  if (source.gscBinding !== null && !binding) return null;
  return {
    site,
    tracking: { rank: rank as TrackingView[], aio: aio as TrackingView[] },
    gscBinding: binding,
  };
}

function parseReportPeriod(value: unknown) {
  const source = record(value);
  const start = calendarDate(source?.start);
  const end = calendarDate(source?.end);
  const comparisonStart = calendarDate(source?.comparisonStart);
  const comparisonEnd = calendarDate(source?.comparisonEnd);
  return source && start && end && comparisonStart && comparisonEnd
    ? { start, end, comparisonStart, comparisonEnd }
    : null;
}

function parseReportSummary(value: unknown): ReportSummaryView | null {
  const source = record(value);
  if (!source) return null;
  const reportId = id(source.id);
  const siteId = id(source.siteId);
  const status = REPORT_STATUSES.includes(source.status as ReportStatus) ? (source.status as ReportStatus) : null;
  const period = parseReportPeriod(source.period);
  const brand = parseBranding(source.brand);
  const snapshotReadyAt = nullableText(source.snapshotReadyAt);
  const deliveredAt = nullableText(source.deliveredAt);
  const createdAt = isoText(source.createdAt);
  const updatedAt = isoText(source.updatedAt);
  if (!reportId || !siteId || !status || !period || !brand || snapshotReadyAt === undefined || deliveredAt === undefined || !createdAt || !updatedAt) return null;
  if ((snapshotReadyAt !== null && !isoText(snapshotReadyAt)) || (deliveredAt !== null && !isoText(deliveredAt))) return null;
  return { id: reportId, siteId, status, period, brand, snapshotReadyAt, deliveredAt, createdAt, updatedAt };
}

export function parseReportsPage(value: unknown): ReportsPageView | null {
  const source = record(value);
  if (!source || !Array.isArray(source.items)) return null;
  const items = source.items.map(parseReportSummary);
  const nextCursor = nullableText(source.nextCursor);
  if (items.some((item) => item === null) || nextCursor === undefined) return null;
  return { items: items as ReportSummaryView[], nextCursor };
}

function parseReportSection(value: unknown, key: ReportSectionKey): ReportSectionView | null {
  const source = record(value);
  const unavailableReason = nullableText(source?.unavailableReason);
  const capturedAt = isoText(source?.capturedAt);
  const data = record(source?.data);
  if (!source || source.key !== key || typeof source.available !== "boolean" || unavailableReason === undefined || !capturedAt || !data) return null;
  return { key, available: source.available, unavailableReason, capturedAt, data };
}

function parseSnapshot(value: unknown): ReportDetailViewModel["snapshot"] | null {
  const source = record(value);
  const schedule = record(source?.schedule);
  const period = record(source?.period);
  const current = record(period?.current);
  const comparison = record(period?.comparison);
  const sections = record(source?.sections);
  const brand = parseBranding(source?.brand);
  const capturedAt = isoText(source?.capturedAt);
  if (!source || source.version !== 1 || !schedule || !period || !current || !comparison || !sections || !brand || !capturedAt) return null;
  const collectionAt = isoText(schedule.collectionAt);
  const retryCutoffAt = isoText(schedule.retryCutoffAt);
  const snapshotAt = isoText(schedule.snapshotAt);
  const currentStart = calendarDate(current.start);
  const currentEnd = calendarDate(current.end);
  const comparisonStart = calendarDate(comparison.start);
  const comparisonEnd = calendarDate(comparison.end);
  if (schedule.timezone !== "Asia/Seoul" || period.timezone !== "America/Los_Angeles" || !collectionAt || !retryCutoffAt || !snapshotAt || !currentStart || !currentEnd || !comparisonStart || !comparisonEnd) return null;
  const parsedSections = Object.fromEntries(
    REPORT_SECTION_KEYS.map((key) => [key, parseReportSection(sections[key], key)]),
  ) as Record<ReportSectionKey, ReportSectionView | null>;
  if (REPORT_SECTION_KEYS.some((key) => parsedSections[key] === null)) return null;
  return {
    version: 1,
    capturedAt,
    schedule: { timezone: "Asia/Seoul", collectionAt, retryCutoffAt, snapshotAt },
    period: {
      timezone: "America/Los_Angeles",
      current: { start: currentStart, end: currentEnd },
      comparison: { start: comparisonStart, end: comparisonEnd },
    },
    brand,
    sections: parsedSections as Record<ReportSectionKey, ReportSectionView>,
  };
}

export function parseReportDetail(value: unknown): ReportDetailViewModel | null {
  const summary = parseReportSummary(value);
  const source = record(value);
  const snapshot = parseSnapshot(source?.snapshot);
  return summary && snapshot ? { ...summary, snapshot } : null;
}

export function parseBillingSummary(value: unknown): BillingSummaryViewModel | null {
  const source = record(value);
  const policy = record(source?.policy);
  if (!source || !policy) return null;
  const status = SUBSCRIPTION_STATUSES.includes(source.status as SubscriptionStatus)
    ? (source.status as SubscriptionStatus)
    : null;
  const currentPeriodStart = nullableText(source.currentPeriodStart);
  const currentPeriodEnd = nullableText(source.currentPeriodEnd);
  const graceEndsAt = nullableText(source.graceEndsAt);
  const nextRetryAt = nullableText(source.nextRetryAt);
  const notice = text(policy.notice);
  if (
    !status ||
    typeof source.amountKrw !== "number" ||
    !Number.isSafeInteger(source.amountKrw) ||
    source.amountKrw < 0 ||
    currentPeriodStart === undefined ||
    currentPeriodEnd === undefined ||
    graceEndsAt === undefined ||
    nextRetryAt === undefined ||
    typeof source.cancelAtPeriodEnd !== "boolean" ||
    policy.timing !== "period_end" ||
    policy.proratedRefund !== false ||
    policy.statutoryExceptionsApply !== true ||
    !notice
  ) return null;
  for (const candidate of [currentPeriodStart, currentPeriodEnd, graceEndsAt, nextRetryAt]) {
    if (candidate !== null && !isoText(candidate)) return null;
  }
  return {
    status,
    amountKrw: source.amountKrw,
    currentPeriodStart,
    currentPeriodEnd,
    graceEndsAt,
    cancelAtPeriodEnd: source.cancelAtPeriodEnd,
    nextRetryAt,
    policy: { timing: "period_end", proratedRefund: false, statutoryExceptionsApply: true, notice },
  };
}

export function parseGscConnections(value: unknown): GscConnectionsView | null {
  const source = record(value);
  if (!source || !Array.isArray(source.items)) return null;
  const items = source.items.map((item): GscConnectionView | null => {
    const connection = record(item);
    if (!connection) return null;
    const connectionId = id(connection.id);
    const label = text(connection.label);
    const tokenExpiresAt = isoText(connection.tokenExpiresAt);
    const scope = text(connection.scope);
    const createdAt = isoText(connection.createdAt);
    const updatedAt = isoText(connection.updatedAt);
    return connectionId && label && tokenExpiresAt && scope === "https://www.googleapis.com/auth/webmasters.readonly" && createdAt && updatedAt
      ? { id: connectionId, label, tokenExpiresAt, scope, createdAt, updatedAt }
      : null;
  });
  return items.some((item) => item === null) ? null : { items: items as GscConnectionView[] };
}

export function parseGscConnectResult(value: unknown): GscConnectResultView | null {
  const source = record(value);
  const authorizationUrl = text(source?.authorizationUrl);
  const expiresAt = isoText(source?.expiresAt);
  if (!source || !authorizationUrl || !expiresAt) return null;
  try {
    const url = new URL(authorizationUrl);
    if (url.protocol !== "https:" || url.hostname !== "accounts.google.com") return null;
  } catch {
    return null;
  }
  return { authorizationUrl, expiresAt };
}

export function parseGscProperties(value: unknown): GscPropertiesView | null {
  const source = record(value);
  if (!source || !Array.isArray(source.items)) return null;
  const items = source.items.map((item): GscPropertyView | null => {
    const property = record(item);
    const siteUrl = text(property?.siteUrl);
    const permissionLevel = text(property?.permissionLevel);
    return property && siteUrl && permissionLevel ? { siteUrl, permissionLevel } : null;
  });
  return items.some((item) => item === null) ? null : { items: items as GscPropertyView[] };
}

export function parseDisconnected(value: unknown): { readonly disconnected: true } | null {
  const source = record(value);
  return source?.disconnected === true ? { disconnected: true } : null;
}

export function productAccessFor(
  summary: BillingSummaryViewModel | null,
  now: Date = new Date(),
): ProductAccess {
  if (!summary) return { canWrite: false, pastReportsOnly: false, reason: "subscription_unavailable" };
  if (summary.status === "active") return { canWrite: true, pastReportsOnly: false, reason: "active" };
  if (
    summary.status === "cancel_at_period_end" &&
    summary.currentPeriodEnd !== null &&
    now.getTime() < Date.parse(summary.currentPeriodEnd)
  ) {
    return { canWrite: true, pastReportsOnly: false, reason: "cancel_at_period_end" };
  }
  if (summary.status === "past_due") {
    return { canWrite: false, pastReportsOnly: true, reason: "past_due" };
  }
  return { canWrite: false, pastReportsOnly: false, reason: summary.status };
}
