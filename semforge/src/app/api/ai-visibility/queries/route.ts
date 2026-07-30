import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { addAiVisibilityQuery, listAiVisibilityQueries } from "@/server/ai-visibility/queries";

const createSchema = z.object({
  domain: z.string().trim().min(4).max(253),
  query: z.string().trim().min(1).max(300),
  countryCode: z.string().trim().length(2).optional().default("KR"),
  device: z.enum(["desktop", "mobile"]).optional().default("desktop"),
});

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const domain = new URL(request.url).searchParams.get("domain") ?? undefined;
  const rows = await listAiVisibilityQueries(auth, domain);
  return jsonOk(rows);
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const body = await parseBody(request, createSchema);
  const row = await addAiVisibilityQuery(auth, body);
  return jsonOk(row, { status: 201 });
});
