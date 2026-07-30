import { ApiError, jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { createResource, listResource } from "@/server/resource";
import { findResource } from "@/server/resources";

/** 모든 도메인 리소스의 목록/생성 엔드포인트. */

async function resolve(context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  const cfg = findResource(resource);
  if (!cfg) throw new ApiError("NOT_FOUND", "존재하지 않는 리소스입니다.");
  return cfg;
}

export const GET = route(
  async (request: Request, context: { params: Promise<{ resource: string }> }) => {
    const cfg = await resolve(context);
    const auth = await requireAuth(request);
    const { data, meta } = await listResource(cfg, auth, request);
    return jsonOk(data, { meta });
  }
);

export const POST = route(
  async (request: Request, context: { params: Promise<{ resource: string }> }) => {
    const cfg = await resolve(context);
    const auth = await requireAuth(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("VALIDATION_ERROR", "요청 본문이 올바른 JSON이 아닙니다.");
    }
    const row = await createResource(cfg, auth, body);
    return jsonOk(row, { status: 201 });
  }
);
