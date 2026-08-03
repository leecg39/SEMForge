import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  MAX_BRAND_PERFORMANCE_COMPETITORS,
  saveBrandPerformanceBrands,
} from "@/server/ai-visibility/brand-performance";

const schema = z.object({
  fid: z.string().trim().min(1).max(80),
  brands: z.array(z.object({
    name: z.string().trim().min(2).max(100),
    aliases: z.array(z.string().trim().min(2).max(100)).max(5).optional(),
    domain: z.string().trim().max(253).nullable().optional(),
  })).max(MAX_BRAND_PERFORMANCE_COMPETITORS),
});

export const PUT = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const input = await parseBody(request, schema);
  return jsonOk(await saveBrandPerformanceBrands(auth, input.fid, input.brands));
});
