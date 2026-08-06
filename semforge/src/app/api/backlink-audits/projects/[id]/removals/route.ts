import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { removalCreateSchema, removalUpdateSchema } from "@/server/backlink-audit/contracts";
import {
  createBacklinkRemovalRequest,
  listBacklinkRemovalRequests,
  updateBacklinkRemovalRequest,
} from "@/server/backlink-audit/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  return jsonOk(await listBacklinkRemovalRequests(auth, id));
});

export const POST = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const { id } = await context.params;
  const input = await parseBody(request, removalCreateSchema);
  return jsonOk(await createBacklinkRemovalRequest(auth, id, input), { status: 201 });
});

export const PATCH = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const { id } = await context.params;
  const input = await parseBody(request, removalUpdateSchema);
  return jsonOk(await updateBacklinkRemovalRequest(auth, id, input));
});
