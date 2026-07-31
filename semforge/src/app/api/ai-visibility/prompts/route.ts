import { z } from "zod";
import { AI_PROMPT_INTENTS } from "@/db/schema";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  createPrompt,
  listPrompts,
  setPromptTracked,
} from "@/server/ai-visibility/prompts-store";

const createSchema = z.object({
  domain: z
    .string({ error: "도메인을 입력해 주세요." })
    .trim()
    .min(1, "도메인을 입력해 주세요.")
    .max(253, "도메인은 253자 이하로 입력해 주세요."),
  prompt: z
    .string({ error: "프롬프트를 입력해 주세요." })
    .trim()
    .min(1, "프롬프트를 입력해 주세요.")
    .max(500, "프롬프트는 500자 이하로 입력해 주세요."),
  topic: z.string().trim().max(100, "주제는 100자 이하로 입력해 주세요.").optional(),
  intent: z.enum(AI_PROMPT_INTENTS).optional(),
  countryCode: z
    .string()
    .trim()
    .length(2, "국가 코드는 두 글자로 입력해 주세요.")
    .optional()
    .default("KR"),
  locale: z
    .string()
    .trim()
    .min(2, "언어 코드는 두 글자 이상으로 입력해 주세요.")
    .max(35, "언어 코드는 35자 이하로 입력해 주세요.")
    .optional()
    .default("ko"),
});

const trackedSchema = z.object({
  id: z.string().trim().min(1, "프롬프트 ID를 입력해 주세요."),
  tracked: z.boolean({ error: "추적 여부는 참 또는 거짓이어야 합니다." }),
});

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const domain = new URL(request.url).searchParams.get("domain") ?? undefined;
  return jsonOk(await listPrompts(auth, domain));
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const body = await parseBody(request, createSchema);
  return jsonOk(await createPrompt(auth, body), { status: 201 });
});

export const PATCH = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const { id, tracked } = await parseBody(request, trackedSchema);
  return jsonOk(await setPromptTracked(auth, id, tracked));
});
