import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  createCampaignTag,
  deleteCampaignTag,
  loadCampaignTagWorkspace,
  updateCampaignTag,
} from "@/server/position-tracking/tags-store";

type Context = { params: Promise<{ campaignId: string }> };

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, "색상은 #RRGGBB 형식으로 입력해 주세요.");

const createSchema = z.object({
  name: z
    .string({ error: "태그 이름을 입력해 주세요." })
    .trim()
    .min(1, "태그 이름을 입력해 주세요.")
    .max(30, "태그 이름은 30자 이하로 입력해 주세요."),
  color: colorSchema.optional(),
});

const updateSchema = z
  .object({
    tagId: z.string().trim().min(1, "태그 ID를 입력해 주세요.").max(200),
    name: z.string().trim().min(1).max(30).optional(),
    color: colorSchema.optional(),
    keywordIds: z
      .array(z.string().trim().min(1).max(200))
      .max(500, "태그에는 키워드를 최대 500개까지 연결할 수 있습니다.")
      .optional(),
  })
  .refine(
    ({ name, color, keywordIds }) =>
      name !== undefined || color !== undefined || keywordIds !== undefined,
    { message: "변경할 태그 정보를 입력해 주세요.", path: ["_root"] },
  );

const deleteSchema = z.object({
  tagId: z.string().trim().min(1, "태그 ID를 입력해 주세요.").max(200),
});

/** 캠페인의 태그와 연결 가능한 키워드, 실제 순위 집계를 조회한다. */
export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const { campaignId } = await context.params;
  return jsonOk(await loadCampaignTagWorkspace(auth, campaignId));
});

/** 편집자 이상이 캠페인 태그를 만든다. */
export const POST = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { campaignId } = await context.params;
  const body = await parseBody(request, createSchema);
  return jsonOk(await createCampaignTag(auth, campaignId, body), { status: 201 });
});

/** 태그의 이름·색상·키워드 연결을 변경한다. */
export const PATCH = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const { campaignId } = await context.params;
  const body = await parseBody(request, updateSchema);
  return jsonOk(await updateCampaignTag(auth, campaignId, body));
});

/** 쿼리의 tagId가 가리키는 태그를 소프트 삭제한다. */
export const DELETE = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  assertCan(auth, "delete");
  const { campaignId } = await context.params;
  const { tagId } = deleteSchema.parse({
    tagId: new URL(request.url).searchParams.get("tagId"),
  });
  return jsonOk(await deleteCampaignTag(auth, campaignId, tagId));
});
