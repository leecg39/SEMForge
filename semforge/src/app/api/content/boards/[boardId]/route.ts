import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getContentBoard, updateContentBoard } from "@/server/content/boards";
import { updateContentBoardSchema } from "@/server/content/contracts";

type Context = { params: Promise<{ boardId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { boardId } = await context.params;
  return jsonOk(await getContentBoard(auth, boardId));
});

export const PATCH = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { boardId } = await context.params;
  const input = await parseBody(request, updateContentBoardSchema);
  return jsonOk(await updateContentBoard(auth, boardId, input));
});
