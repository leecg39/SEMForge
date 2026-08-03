import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  deleteSocialPost,
  getSocialPost,
  updateSocialPost,
} from "@/server/social/posts";
import { socialPostSchema } from "../route";
type Context = { params: Promise<{ id: string }> };
export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  return jsonOk(await getSocialPost(auth, (await context.params).id));
});
export const PATCH = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  return jsonOk(
    await updateSocialPost(
      auth,
      (await context.params).id,
      await parseBody(request, socialPostSchema),
    ),
  );
});
export const DELETE = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  assertCan(auth, "delete");
  await deleteSocialPost(auth, (await context.params).id);
  return jsonOk({ deleted: true });
});
