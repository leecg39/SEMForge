import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { collectMapRanks } from "@/server/maprank/collect";

const bodySchema = z.object({
  forceRefresh: z.boolean().optional().default(false),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const body = await parseBody(request, bodySchema).catch(() => ({ forceRefresh: false }));
  const report = await collectMapRanks(auth, body);
  return jsonOk(report, { meta: { source: "talordata" } });
});
