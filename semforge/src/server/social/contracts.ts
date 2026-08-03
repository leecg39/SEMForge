import { z } from "zod";
import type { AuthContext } from "@/lib/session";
import type {
  SocialPlatform,
  SocialProviderCapabilities,
} from "@/types/social";

export const socialPostSchema = z.object({
  text: z.string().max(2200).optional().default(""),
  linkUrl: z.string().url().nullable().optional(),
  utm: z.record(z.string(), z.string()).optional(),
  publishMode: z.enum(["draft", "now", "scheduled", "recurring"]),
  scheduledAt: z.string().datetime().nullable().optional(),
  recurrence: z.object({
    frequency: z.literal("weekly").optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    time: z.string().optional(),
  }).optional(),
  recurrenceEndAt: z.string().datetime().nullable().optional(),
  profileIds: z.array(z.string()).min(1),
  tagIds: z.array(z.string()).optional(),
  mediaAssetId: z.string().nullable().optional(),
  idempotencyKey: z.string().max(120).optional(),
});

export interface SocialPublishInput {
  auth: AuthContext;
  platform: SocialPlatform;
  externalId: string;
  parentExternalId: string | null;
  accessToken: string | null;
  text: string;
  linkUrl: string | null;
  publicImageUrl: string | null;
  idempotencyKey: string;
}

export interface SocialPublishResult {
  externalPostId: string;
  externalUrl: string | null;
  publishedAt: Date;
}

export interface SocialProfileMetric {
  followers: number | null;
  reach: number | null;
  impressions: number | null;
  interactions: number | null;
  posts: number | null;
  capturedAt: Date;
  source: string;
}

export interface SocialContentMetric {
  externalPostId: string;
  externalUrl: string | null;
  caption: string | null;
  mediaUrl: string | null;
  publishedAt: Date;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  impressions: number | null;
  source: string;
}

export interface SocialCompetitorMetric {
  externalId: string | null;
  followers: number | null;
  posts: number | null;
  source: string;
  capturedAt: Date;
}

export interface SocialProviderAdapter {
  platform: SocialPlatform;
  capabilities(): SocialProviderCapabilities;
  publish(input: SocialPublishInput): Promise<SocialPublishResult>;
  syncProfile(input: {
    auth: AuthContext;
    externalId: string;
    accessToken: string | null;
  }): Promise<SocialProfileMetric>;
  syncPosts(input: {
    auth: AuthContext;
    externalId: string;
    accessToken: string | null;
  }): Promise<SocialContentMetric[]>;
  lookupCompetitor?(input: {
    auth: AuthContext;
    ownExternalId: string;
    username: string;
    accessToken: string | null;
  }): Promise<SocialCompetitorMetric>;
}

export class SocialProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unsupported"
      | "rate_limited"
      | "reconnect_required"
      | "timeout"
      | "provider_error",
    readonly retryable: boolean,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "SocialProviderError";
  }
}
