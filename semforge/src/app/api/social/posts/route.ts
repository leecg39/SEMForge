import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { createSocialPost, listSocialPosts } from "@/server/social/posts";
import { socialPostSchema } from "./schema";

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
