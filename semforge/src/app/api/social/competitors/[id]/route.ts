import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { deleteSocialCompetitor } from "@/server/social/overview";
export const DELETE = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuth(request);
    await deleteSocialCompetitor(
      auth,
      socialFid(request),
      (await context.params).id,
    );
    return jsonOk({ deleted: true });
  },
);
