import { route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { marketingFlags } from "@/server/marketing/config";
import { requiredParam, trafficView } from "@/server/marketing/http";
import { marketingIntelligence } from "@/server/marketing/runtime";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const params = new URL(request.url).searchParams;
  if (!marketingFlags.intelligence()) {
    const now = new Date().toISOString();
    return Response.json({ status: "unavailable", cache: "stale", measurement: "absolute", source: ["airbyte"], fetchedAt: now, expiresAt: now, reason: "Marketing Intelligence 기능이 비활성화되어 있습니다." }, { status: 503 });
  }
  const result = await marketingIntelligence().getTrafficReport(auth, requiredParam(request, "fid"), {
    from: requiredParam(request, "from"), to: requiredParam(request, "to"), view: trafficView(params.get("view")),
  });
  return Response.json(result, { status: result.status === "unavailable" ? 503 : 200 });
});
