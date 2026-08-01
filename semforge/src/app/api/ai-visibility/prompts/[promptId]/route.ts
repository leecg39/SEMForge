import { ApiError, jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { removeAiVisibilityPrompt } from "@/server/ai-visibility/projects";

export const DELETE = route(async (
  request: Request,
  context: { params: Promise<{ promptId: string }> },
) => {
  const auth = await requireAuth(request);
  assertCan(auth, "delete");
  const folderId = new URL(request.url).searchParams.get("fid")?.trim();
  if (!folderId) throw new ApiError("VALIDATION_ERROR", "fid 파라미터가 필요합니다.");
  const { promptId } = await context.params;
  return jsonOk(await removeAiVisibilityPrompt(auth, folderId, promptId));
});
