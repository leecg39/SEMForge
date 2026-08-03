import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { createContentRunSchema } from "@/server/content/contracts";
import { createContentRun, latestContentRunForBoard } from "@/server/content/runs";

type Context = { params: Promise<{ boardId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { boardId } = await context.params;
  return jsonOk(await latestContentRunForBoard(auth, boardId));
});

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { boardId } = await context.params;
  const input = await parseBody(request, createContentRunSchema);
  return jsonOk(await createContentRun(auth, boardId, input), { status: 202 });
});
