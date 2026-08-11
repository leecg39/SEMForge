import { ApiError, jsonOk, parseFormData, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { BACKLINK_MAX_IMPORT_BYTES } from "@/server/backlinks/contracts";
import { previewBacklinkCsv } from "@/server/backlinks/service";

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const form = await parseFormData(request);
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("VALIDATION_ERROR", "가져올 CSV 파일을 선택해 주세요.");
  if (file.size > BACKLINK_MAX_IMPORT_BYTES) throw new ApiError("VALIDATION_ERROR", "CSV 파일은 10MB 이하여야 합니다.");
  return jsonOk(await previewBacklinkCsv(auth, file));
});
