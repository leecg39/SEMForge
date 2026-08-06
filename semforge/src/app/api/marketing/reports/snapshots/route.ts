import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { marketingFlags } from "@/server/marketing/config";
import { createMarketingSnapshot } from "@/server/marketing/reports";
import { ApiError } from "@/lib/api";

const schema = z.object({
  fid: z.string().trim().min(1).max(100),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  type: z.enum(["marketing_overview", "attribution"]),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  if (!marketingFlags.intelligence()) throw new ApiError("FORBIDDEN", "Marketing Intelligence 기능이 비활성화되어 있습니다.");
  const input = await parseBody(request, schema);
  return jsonOk(await createMarketingSnapshot(auth, { folderId: input.fid, from: input.from, to: input.to, type: input.type }), { status: 201 });
});
