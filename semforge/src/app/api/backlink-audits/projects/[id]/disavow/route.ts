import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { disavowEntryCreateSchema, disavowEntryDeleteSchema } from "@/server/backlink-audit/contracts";
import { addDisavowEntry, deleteDisavowEntry, listDisavowEntries } from "@/server/backlink-audit/disavow";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  return jsonOk(await listDisavowEntries(auth, id));
});

export const POST = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const { id } = await context.params;
  const input = await parseBody(request, disavowEntryCreateSchema);
  return jsonOk(await addDisavowEntry(auth, id, input), { status: 201 });
});

export const DELETE = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const { id } = await context.params;
  const input = disavowEntryDeleteSchema.parse({ id: new URL(request.url).searchParams.get("id") });
  return jsonOk(await deleteDisavowEntry(auth, id, input.id));
});
