import { z } from "zod";
import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { getSocialOverview } from "@/server/social/overview";

export const dynamic = "force-dynamic";
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const range = z
    .enum(["7d", "28d", "90d"])
    .parse(new URL(request.url).searchParams.get("range") || "28d");
  return jsonOk(await getSocialOverview(auth, socialFid(request), range));
});
