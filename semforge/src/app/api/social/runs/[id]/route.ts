import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getSocialRun } from "@/server/social/runs";
export const GET = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuth(request);
    assertCan(auth, "read");
    return jsonOk(await getSocialRun(auth, (await context.params).id));
  },
);
