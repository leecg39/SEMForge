import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { createSocialPost, listSocialPosts } from "@/server/social/posts";

export const socialPostSchema = z.object({
  text: z.string().max(2200).optional().default(""),
  linkUrl: z.string().url().nullable().optional(),
  utm: z.record(z.string(), z.string()).optional(),
  publishMode: z.enum(["draft", "now", "scheduled", "recurring"]),
  scheduledAt: z.string().datetime().nullable().optional(),
  recurrence: z
    .object({
      frequency: z.literal("weekly").optional(),
      weekday: z.number().int().min(0).max(6).optional(),
      time: z.string().optional(),
    })
    .optional(),
  recurrenceEndAt: z.string().datetime().nullable().optional(),
  profileIds: z.array(z.string()).min(1),
  tagIds: z.array(z.string()).optional(),
  mediaAssetId: z.string().nullable().optional(),
  idempotencyKey: z.string().max(120).optional(),
});
export const dynamic = "force-dynamic";
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  return jsonOk(await listSocialPosts(auth, socialFid(request)));
});
export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  return jsonOk(
    await createSocialPost(
      auth,
      socialFid(request),
      await parseBody(request, socialPostSchema),
    ),
    { status: 201 },
  );
});
