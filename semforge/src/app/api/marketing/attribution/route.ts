import { route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { marketingFlags } from "@/server/marketing/config";
import { requiredParam } from "@/server/marketing/http";
import { marketingIntelligence } from "@/server/marketing/runtime";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const now = new Date().toISOString();
  if (!marketingFlags.intelligence() || !marketingFlags.crm()) {
    return Response.json({ status: "unavailable", cache: "stale", measurement: "inferred", source: ["airbyte:hubspot"], fetchedAt: now, expiresAt: now, reason: "CRM 귀속 기능이 비활성화되어 있습니다." }, { status: 503 });
  }
  const result = await marketingIntelligence().getAttributionReport(auth, requiredParam(request, "fid"), {
    from: requiredParam(request, "from"), to: requiredParam(request, "to"),
  });
  return Response.json(result, { status: result.status === "unavailable" ? 503 : 200 });
});
