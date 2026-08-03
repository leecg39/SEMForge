import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { generatePromptResearchIdeas } from "@/server/ai-visibility/prompt-research";

const schema = z.object({
  fid: z.string().trim().min(1).max(80),
  seed: z.string().trim().min(2).max(150),
  count: z.number().int().min(4).max(12).optional(),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const input = await parseBody(request, schema);
  return jsonOk(await generatePromptResearchIdeas(auth, input));
});
