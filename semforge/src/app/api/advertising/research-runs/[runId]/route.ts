import { after } from "next/server";
import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  executeAdvertisingResearch,
  getAdvertisingResearchReport,
  getAdvertisingResearchRun,
} from "@/server/advertising/research";

type Ctx = { params: Promise<{ runId: string }> };

export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { runId } = await context.params;
  const run = await getAdvertisingResearchRun(auth, runId);
  if (run.status === "queued") {
    after(() => executeAdvertisingResearch(auth, runId));
  }
  const report = await getAdvertisingResearchReport(auth, runId);
  return jsonOk(report, {
    meta: {
      pollAfterMs: run.status === "queued" || run.status === "running" ? 1500 : null,
      metricsUnavailableAsNull: true,
    },
  });
});

