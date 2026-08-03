import { z } from "zod";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import {
  createSocialTag,
  deleteSocialTag,
  listSocialTags,
} from "@/server/social/overview";
const schema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().optional(),
  description: z.string().max(300).nullable().optional(),
});
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  return jsonOk(await listSocialTags(auth, socialFid(request)));
});
export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(
    await createSocialTag(
      auth,
      socialFid(request),
      await parseBody(request, schema),
    ),
    { status: 201 },
  );
});
export const DELETE = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const tagId = new URL(request.url).searchParams.get("id")?.trim();
  if (!tagId)
    throw new ApiError("VALIDATION_ERROR", "id 파라미터가 필요합니다.");
  await deleteSocialTag(auth, socialFid(request), tagId);
  return jsonOk({ deleted: true });
});
