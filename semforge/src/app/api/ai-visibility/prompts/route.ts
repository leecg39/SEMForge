import { z } from "zod";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  addAiVisibilityPrompts,
  importPositionTrackingPrompts,
  listAiVisibilityPrompts,
} from "@/server/ai-visibility/projects";

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("position_tracking") }),
  z.object({
    mode: z.literal("prompts"),
    source: z.enum(["manual", "csv"]),
    prompts: z.array(z.object({
      prompt: z.string().trim().min(1).max(300),
      topic: z.string().trim().max(80).optional(),
    })).min(1).max(20),
  }),
]);

function fid(request: Request): string {
  const value = new URL(request.url).searchParams.get("fid")?.trim();
  if (!value) throw new ApiError("VALIDATION_ERROR", "fid 파라미터가 필요합니다.");
  return value;
}

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  return jsonOk(await listAiVisibilityPrompts(auth, fid(request)));
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const input = await parseBody(request, schema);
  const folderId = fid(request);
  if (input.mode === "position_tracking") {
    return jsonOk(await importPositionTrackingPrompts(auth, folderId));
  }
  return jsonOk(await addAiVisibilityPrompts(auth, folderId, input));
});
