import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { deleteSocialTag } from "@/server/social/overview";
export const DELETE = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuth(request);
    await deleteSocialTag(auth, socialFid(request), (await context.params).id);
    return jsonOk({ deleted: true });
  },
);
