import { ApiError, jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { issueDeleteCode } from "@/server/resource";
import { findResource } from "@/server/resources";

type Ctx = { params: Promise<{ resource: string; id: string }> };

/**
 * 영구 삭제 확인 코드 발급.
 * 원본 Semrush 폴더 삭제가 호출마다 새 6자리 코드를 요구하는 UX(증거 O)를 서버 발급으로 재현한다.
 */
export const POST = route(async (request: Request, context: Ctx) => {
  const { resource, id } = await context.params;
  const cfg = findResource(resource);
  if (!cfg) throw new ApiError("NOT_FOUND", "존재하지 않는 리소스입니다.");
  const auth = await requireAuth(request);
  return jsonOk(await issueDeleteCode(cfg, auth, id));
});
