import { after } from "next/server";
import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { registerAiVisibilityDueJob } from "@/server/ai-visibility/schedule";
import { createAiVisibilityRun, drainAiVisibilityRun } from "@/server/ai-visibility/runs";

const schema = z.object({
  fid: z.string().trim().min(1).max(80),
});

export const POST = route(async (request: Request) => {
  registerAiVisibilityDueJob();
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const input = await parseBody(request, schema);
  const created = await createAiVisibilityRun(auth, input.fid, "manual");
  after(async () => {
    const report = await drainAiVisibilityRun(auth, created.runId);
    if (report.status === "failed") {
      console.error(`[ai-visibility] run ${created.runId} failed: ${report.error ?? "unknown"}`);
    }
  });
  return jsonOk(created, {
    status: created.reused ? 200 : 202,
    meta: {
      execution: "background",
      poll: `/api/ai-visibility/runs/${created.runId}/`,
      recovery: "/api/cron/run-due/?only=ai_visibility_collect_due",
    },
  });
});
