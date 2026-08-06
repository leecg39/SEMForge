// @TASK NAVER-KI-API-04 - 탐색 키워드 목록 저장 API
// @SPEC user-approved-plan#3-d-authenticated-features
import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { assertNaverKeywordFeature } from "@/server/naver-keywords/route-utils";
import { saveNaverKeywordsToList } from "@/server/naver-keywords/save";

const itemSchema = z.object({
  keyword: z.string(),
  snapshotId: z.string().trim().min(1).max(100).optional(),
  volume: z.number().int().min(0).optional(),
  intent: z.enum(["informational", "navigational", "commercial", "transactional"]).optional(),
}).strict();

const bodySchema = z.object({
  listId: z.string().trim().min(1).max(100),
  items: z.array(itemSchema).min(1).max(100),
}).strict();

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  assertNaverKeywordFeature();
  const body = await parseBody(request, bodySchema);
  return jsonOk(await saveNaverKeywordsToList(auth, body));
});
