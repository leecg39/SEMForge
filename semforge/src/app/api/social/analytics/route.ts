import { z } from "zod";
import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { getSocialAnalytics } from "@/server/social/overview";
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const query = new URL(request.url).searchParams;
  const range = z
    .enum(["7d", "28d", "90d", "400d"])
    .parse(query.get("range") || "28d");
  return jsonOk(
    await getSocialAnalytics(auth, socialFid(request), {
      range,
      profileId: query.get("profile"),
    }),
  );
});
