import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import { enqueueSocialSync, executeSocialSync } from "@/server/social/runs";
export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const run = await enqueueSocialSync(auth, socialFid(request), "manual");
  after(async () => {
    const result = await executeSocialSync(auth, run.id);
    if (result.status === "failed")
      console.error(
        `[social] background sync ${run.id} failed: ${result.error}`,
      );
  });
  return jsonOk(run, {
    status: 202,
    meta: {
      execution: "background",
      poll: `/api/social/runs/${run.id}/`,
      recovery: "/api/cron/run-due/?only=social_publish_and_sync_due",
    },
  });
});
import { after } from "next/server";
