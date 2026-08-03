import { z } from "zod";
import { ApiError, jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { getBrandPerformanceDashboard } from "@/server/ai-visibility/brand-performance";

const providerSchema = z.enum(["google_aio", "chatgpt_web", "gemini_grounded"]);

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const search = new URL(request.url).searchParams;
  const fid = search.get("fid")?.trim();
  if (!fid) throw new ApiError("VALIDATION_ERROR", "fid 파라미터가 필요합니다.");
  const rawProvider = search.get("provider")?.trim();
  const provider = rawProvider ? providerSchema.parse(rawProvider) : undefined;
  return jsonOk(await getBrandPerformanceDashboard(auth, fid, {
    runId: search.get("runId")?.trim() || undefined,
    provider,
    locationKey: search.get("locationKey")?.trim() || undefined,
  }));
});
