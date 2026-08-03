import { z } from "zod";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import {
  createSocialCompetitor,
  deleteSocialCompetitor,
  listSocialCompetitors,
} from "@/server/social/overview";
const schema = z.object({
  name: z.string().trim().min(1).max(120),
  domain: z.string().max(253).nullable().optional(),
  instagramUsername: z.string().max(100).nullable().optional(),
});
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  return jsonOk(await listSocialCompetitors(auth, socialFid(request)));
});
export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(
    await createSocialCompetitor(
      auth,
      socialFid(request),
      await parseBody(request, schema),
    ),
    { status: 201 },
  );
});
export const DELETE = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const competitorId = new URL(request.url).searchParams.get("id")?.trim();
  if (!competitorId)
    throw new ApiError("VALIDATION_ERROR", "id 파라미터가 필요합니다.");
  await deleteSocialCompetitor(auth, socialFid(request), competitorId);
  return jsonOk({ deleted: true });
});
