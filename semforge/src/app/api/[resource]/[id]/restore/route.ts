import { ApiError, jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { restoreResource } from "@/server/resource";
import { findResource } from "@/server/resources";

type Ctx = { params: Promise<{ resource: string; id: string }> };

export const POST = route(async (request: Request, context: Ctx) => {
  const { resource, id } = await context.params;
  const cfg = findResource(resource);
  if (!cfg) throw new ApiError("NOT_FOUND", "존재하지 않는 리소스입니다.");
  const auth = await requireAuth(request);
  return jsonOk(await restoreResource(cfg, auth, id));
});
