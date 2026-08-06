import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { analyzeBacklinkGap, backlinkGapBootstrap, backlinkGapRequestSchema } from "@/server/backlinks/gap";

export const maxDuration = 300;

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  return jsonOk(await backlinkGapBootstrap(auth));
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const input = await parseBody(request, backlinkGapRequestSchema);
  assertCan(auth, input.collect ? "create" : "read");
  const result = await analyzeBacklinkGap(auth, input);
  return jsonOk(result, { meta: { source: "workspace-backlink-datasets" } });
});
