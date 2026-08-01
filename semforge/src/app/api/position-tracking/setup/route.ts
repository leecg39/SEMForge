import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { setupPositionTracking } from "@/server/position-tracking/runs";

const schema = z.object({
  campaignId: z.string().trim().min(1).max(64).optional(),
  folderId: z.string().trim().min(1).max(64).nullable().optional(),
  domain: z.string().trim().min(3).max(253),
  name: z.string().trim().min(1).max(100).optional(),
  target: z.object({
    type: z.enum(["root_domain", "subdomain", "exact_url", "subfolder"]),
    value: z.string().trim().min(3).max(2048),
  }),
  searchEngine: z.enum(["google", "bing", "chatgpt", "gemini"]),
  device: z.enum(["desktop", "mobile", "tablet"]),
  locationKey: z.string().trim().min(2).max(80),
  businessName: z.string().trim().max(200).nullable().optional(),
  keywords: z.array(z.object({
    keyword: z.string().trim().min(1).max(200),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  })).min(1).max(20),
  weeklyDigestEnabled: z.boolean().default(true),
  idempotencyKey: z.string().trim().min(8).max(100),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const input = await parseBody(request, schema);
  const result = await setupPositionTracking(auth, input);
  return jsonOk(result, { status: result.reused ? 200 : 201 });
});
