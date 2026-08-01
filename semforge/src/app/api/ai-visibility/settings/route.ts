import { z } from "zod";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  getAiVisibilitySettings,
  saveAiVisibilitySettings,
} from "@/server/ai-visibility/projects";

const schema = z.object({
  brandName: z.string().trim().min(1).max(100),
  brandAliases: z.array(z.string().trim().min(1).max(100)).max(5).optional().default([]),
  providers: z.array(z.enum(["google_aio", "chatgpt_web", "gemini_grounded"])).min(1).max(3),
  locationKeys: z.array(z.string().trim().min(1).max(80)).min(1).max(2),
  schedule: z.enum(["off", "weekly"]),
});

function fid(request: Request): string {
  const value = new URL(request.url).searchParams.get("fid")?.trim();
  if (!value) throw new ApiError("VALIDATION_ERROR", "fid 파라미터가 필요합니다.");
  return value;
}

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  return jsonOk(await getAiVisibilitySettings(auth, fid(request)));
});

export const PUT = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const input = await parseBody(request, schema);
  return jsonOk(await saveAiVisibilitySettings(auth, fid(request), input));
});
