import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { appendContentMessage } from "@/server/content/boards";
import { createContentMessageSchema } from "@/server/content/contracts";

type Context = { params: Promise<{ boardId: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { boardId } = await context.params;
  const input = await parseBody(request, createContentMessageSchema);
  return jsonOk(await appendContentMessage(auth, boardId, input), { status: 201 });
});
