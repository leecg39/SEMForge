import { z } from "zod";
import { route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { getSocialContentInsights, socialCsv } from "@/server/social/overview";
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "export");
  const query = new URL(request.url).searchParams;
  const range = z
    .enum(["7d", "28d", "90d", "400d"])
    .parse(query.get("range") || "28d");
  const result = await getSocialContentInsights(auth, socialFid(request), {
    range,
    profileId: query.get("profile"),
    page: 1,
    pageSize: 1_000,
  });
  return new Response(`\ufeff${socialCsv(result.rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="social-content-${Date.now()}.csv"`,
    },
  });
});
