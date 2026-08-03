export const SOCIAL_PLATFORMS = [
  "facebook_page",
  "instagram_professional",
  "google_business_profile",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialPostStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "queued"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "cancelled";

export interface SocialProviderCapabilities {
  connect: boolean;
  publishText: boolean;
  publishImage: boolean;
  insights: boolean;
  competitorDiscovery: boolean;
  reason: string | null;
}

export interface SocialProjectListItem {
  id: string;
  name: string;
  domain: string;
  configured: boolean;
  profileCount: number;
}

export interface SocialProfileView {
  id: string;
  platform: SocialPlatform;
  externalId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  enabled: boolean;
  capabilities: SocialProviderCapabilities;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface SocialSettingsView {
  project: { id: string; folderId: string; name: string; domain: string };
  timezone: string;
  approvalRequired: boolean;
  syncEnabled: boolean;
  profiles: SocialProfileView[];
  capabilities: Record<SocialPlatform, SocialProviderCapabilities>;
  connections: Array<{
    provider: "meta" | "google_business_profile";
    status:
      "active" | "reconnect_required" | "revoked" | "error" | "unavailable";
    accountName: string | null;
    reason: string | null;
  }>;
}

export interface SocialPostView {
  id: string;
  text: string;
  linkUrl: string | null;
  utm: Record<string, string>;
  status: SocialPostStatus;
  publishMode: "draft" | "now" | "scheduled" | "recurring";
  scheduledAt: string | null;
  recurrence: { frequency?: "weekly"; weekday?: number; time?: string };
  recurrenceEndAt: string | null;
  media: null | {
    id: string;
    url: string;
    width: number;
    height: number;
    altText: string | null;
  };
  tags: Array<{ id: string; name: string; color: string }>;
  targets: Array<{
    id: string;
    profileId: string;
    platform: SocialPlatform;
    profileName: string;
    status:
      "draft" | "queued" | "publishing" | "published" | "failed" | "cancelled";
    externalUrl: string | null;
    lastError: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  lastError: string | null;
}

export interface SocialRecommendation {
  id: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "info";
  href: string;
  cta: string;
}

export interface SocialOverviewResponse {
  project: SocialSettingsView["project"];
  projects: SocialProjectListItem[];
  range: "7d" | "28d" | "90d";
  kpis: {
    published: number;
    scheduled: number;
    failed: number;
    connectedProfiles: number;
  };
  recommendations: SocialRecommendation[];
  activity: Array<{
    date: string;
    published: number;
    scheduled: number;
    failed: number;
  }>;
  upcoming: SocialPostView[];
  recentFailures: SocialPostView[];
  profiles: SocialProfileView[];
  lastSyncedAt: string | null;
}

export interface SocialAnalyticsResponse {
  projectId: string;
  range: "7d" | "28d" | "90d" | "400d";
  profiles: SocialProfileView[];
  summary: {
    followers: number | null;
    reach: number | null;
    impressions: number | null;
    interactions: number | null;
    posts: number | null;
  };
  trend: Array<{
    date: string;
    profileId: string;
    followers: number | null;
    reach: number | null;
    impressions: number | null;
    interactions: number | null;
    posts: number | null;
  }>;
  note: string;
}

export interface SocialContentInsightRow {
  id: string;
  profileId: string;
  platform: SocialPlatform;
  profileName: string;
  caption: string | null;
  mediaUrl: string | null;
  externalUrl: string | null;
  publishedAt: string;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  impressions: number | null;
  interactions: number | null;
  engagementRate: number | null;
}

export interface SocialRunView {
  id: string;
  kind: "publish" | "sync";
  status:
    "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  total: number;
  succeeded: number;
  failed: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}
