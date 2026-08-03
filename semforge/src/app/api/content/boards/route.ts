import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { createContentBoard, listContentBoards } from "@/server/content/boards";
import { createContentBoardSchema } from "@/server/content/contracts";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const result = await listContentBoards(auth, request);
  return jsonOk(result.data, { meta: result.meta });
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, createContentBoardSchema);
  return jsonOk(await createContentBoard(auth, input), { status: 201 });
});
