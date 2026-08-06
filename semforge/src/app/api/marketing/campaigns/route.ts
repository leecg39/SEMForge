import { route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { marketingFlags } from "@/server/marketing/config";
import { requiredParam } from "@/server/marketing/http";
import { marketingIntelligence } from "@/server/marketing/runtime";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const params = new URL(request.url).searchParams;
  const provider = params.get("provider");
  const normalizedProvider = provider === "google_ads" || provider === "meta_ads" ? provider : undefined;
  const now = new Date().toISOString();
  if (!marketingFlags.intelligence() || !marketingFlags.ads()) {
    return Response.json({ status: "unavailable", cache: "stale", measurement: "calculated", source: ["airbyte:advertising"], fetchedAt: now, expiresAt: now, reason: "광고 성과 기능이 비활성화되어 있습니다." }, { status: 503 });
  }
  const result = await marketingIntelligence().getCampaignPerformance(auth, requiredParam(request, "fid"), {
    from: requiredParam(request, "from"), to: requiredParam(request, "to"), provider: normalizedProvider,
  });
  return Response.json(result, { status: result.status === "unavailable" ? 503 : 200 });
});
