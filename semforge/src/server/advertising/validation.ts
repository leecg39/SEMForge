import { z } from "zod";

const keywordSchema = z.object({
  id: z.string().optional(),
  keyword: z.string().trim().min(1).max(100),
  matchType: z.enum(["broad", "phrase", "exact"]),
  negative: z.boolean(),
  source: z.enum(["manual", "research", "ai"]).optional(),
  volume: z.number().int().nonnegative().nullable().optional(),
  cpcCents: z.number().int().nonnegative().nullable().optional(),
});

const creativeSchema = z.object({
  id: z.string().optional(),
  headlines: z.array(z.string().max(180)).max(15),
  descriptions: z.array(z.string().max(360)).max(4),
  primaryText: z.string().max(500).nullable().optional(),
  path1: z.string().max(30).nullable().optional(),
  path2: z.string().max(30).nullable().optional(),
  callToAction: z.string().max(80).nullable().optional(),
  finalUrl: z.string().trim().min(1).max(2048),
});

export const campaignCreateSchema = z.object({
  folderId: z.string().trim().min(1).max(80).nullable().optional(),
  requestId: z.string().trim().min(8).max(100).nullable().optional(),
  name: z.string().trim().min(1).max(100),
  domain: z.string().trim().min(3).max(253),
  platform: z.enum(["google", "meta"]),
  goal: z.enum(["sales", "leads", "traffic", "awareness"]),
  countryCode: z.string().trim().length(2),
  languageCode: z.string().trim().min(2).max(10),
  dailyBudgetCents: z.number().int().min(0).max(1_000_000_000),
  currencyCode: z.string().trim().min(3).max(3),
  adGroupName: z.string().trim().min(1).max(100),
  finalUrl: z.string().trim().min(1).max(2048),
  status: z.enum(["draft", "ready"]).optional(),
  keywords: z.array(keywordSchema).max(200).optional(),
  creative: creativeSchema.optional(),
});

export const campaignPatchSchema = campaignCreateSchema.partial().extend({
  version: z.number().int().positive(),
});

