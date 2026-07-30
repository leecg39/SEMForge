import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { addMapRankKeyword, listMapRankKeywords } from "@/server/maprank/keywords";

const createSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  keyword: z.string().trim().min(1).max(200),
  locationText: z.string().trim().max(100).optional().default(""),
  countryCode: z.string().trim().length(2).optional().default("KR"),
});

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const rows = await listMapRankKeywords(auth);
  return jsonOk(rows);
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const body = await parseBody(request, createSchema);
  const row = await addMapRankKeyword(auth, body);
  return jsonOk(row, { status: 201 });
});
