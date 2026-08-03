import { z } from "zod";
import { after } from "next/server";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  approveSocialPost,
  cancelSocialPost,
  rejectSocialPost,
  retrySocialPost,
  submitSocialPost,
} from "@/server/social/posts";
import { publishSocialPost } from "@/server/social/runs";
const bodySchema = z.object({
  note: z.string().max(1000).nullable().optional(),
});
export const POST = route(
  async (
    request: Request,
    context: { params: Promise<{ id: string; action: string }> },
  ) => {
    const auth = await requireAuth(request);
    assertCan(auth, "update");
    const { id, action } = await context.params;
    let body: z.infer<typeof bodySchema> = {};
    if (["approve", "reject"].includes(action))
      body = await parseBody(request, bodySchema);
    if (action === "submit") return jsonOk(await submitSocialPost(auth, id));
    if (action === "approve")
      return jsonOk(await approveSocialPost(auth, id, body.note));
    if (action === "reject")
      return jsonOk(await rejectSocialPost(auth, id, body.note));
    if (action === "retry") return jsonOk(await retrySocialPost(auth, id));
    if (action === "cancel") return jsonOk(await cancelSocialPost(auth, id));
    if (action === "publish") {
      after(async () => {
        const result = await publishSocialPost(auth, id, "manual");
        if (result.status === "failed")
          console.error(
            `[social] background publish ${id} failed: ${result.errors.join("; ")}`,
          );
      });
      return jsonOk(
        { postId: id, status: "queued" },
        {
          status: 202,
          meta: {
            execution: "background",
            recovery: "/api/cron/run-due/?only=social_publish_and_sync_due",
          },
        },
      );
    }
    throw new ApiError("NOT_FOUND", "지원하지 않는 게시 동작입니다.");
  },
);
