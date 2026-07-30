import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { removeMapRankKeyword } from "@/server/maprank/keywords";

export const DELETE = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "delete");
    const { id } = await params;
    const result = await removeMapRankKeyword(auth, id);
    return jsonOk(result);
  }
);
