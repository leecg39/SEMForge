import { z } from "zod";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { bulkResource } from "@/server/resource";
import { findResource } from "@/server/resources";

const bulkSchema = z.object({
  action: z.enum(["delete", "restore"]),
  ids: z.array(z.string().min(1)).min(1, "대상을 하나 이상 선택하세요."),
});

/** 일괄 작업(P — 원본 목록에는 선택 체크박스가 없어 관찰되지 않은 기능). */
export const POST = route(
  async (request: Request, context: { params: Promise<{ resource: string }> }) => {
    const { resource } = await context.params;
    const cfg = findResource(resource);
    if (!cfg) throw new ApiError("NOT_FOUND", "존재하지 않는 리소스입니다.");
    const auth = await requireAuth(request);
    const { action, ids } = await parseBody(request, bulkSchema);
    const result = await bulkResource(cfg, auth, action, ids);
    return jsonOk(result);
  }
);
