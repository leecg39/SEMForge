import { ApiError, jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  getResource,
  purgeResource,
  softDeleteResource,
  updateResource,
} from "@/server/resource";
import { findResource } from "@/server/resources";

type Ctx = { params: Promise<{ resource: string; id: string }> };

async function resolve(context: Ctx) {
  const { resource, id } = await context.params;
  const cfg = findResource(resource);
  if (!cfg) throw new ApiError("NOT_FOUND", "존재하지 않는 리소스입니다.");
  return { cfg, id };
}

export const GET = route(async (request: Request, context: Ctx) => {
  const { cfg, id } = await resolve(context);
  const auth = await requireAuth(request);
  return jsonOk(await getResource(cfg, auth, id));
});

export const PATCH = route(async (request: Request, context: Ctx) => {
  const { cfg, id } = await resolve(context);
  const auth = await requireAuth(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "요청 본문이 올바른 JSON이 아닙니다.");
  }
  return jsonOk(await updateResource(cfg, auth, id, body));
});

/**
 * 기본은 소프트 삭제(휴지통 이동).
 * `?purge=1` 은 영구 삭제이며 관리자 권한과 확인 코드(`?code=`)를 요구한다.
 */
export const DELETE = route(async (request: Request, context: Ctx) => {
  const { cfg, id } = await resolve(context);
  const auth = await requireAuth(request);
  const url = new URL(request.url);
  const purge = url.searchParams.get("purge") === "1";

  if (purge) {
    const code = url.searchParams.get("code");
    return jsonOk(await purgeResource(cfg, auth, id, code));
  }
  return jsonOk(await softDeleteResource(cfg, auth, id));
});
