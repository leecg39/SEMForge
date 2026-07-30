import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { replyToGbpReview } from "@/server/gbp/client";
import { getValidGbpAccessToken } from "@/server/gbp/connections";

const bodySchema = z.object({
  reviewName: z.string().trim().min(1),
  comment: z.string().trim().min(1, "답글 내용을 입력해 주세요.").max(4096),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "update");
  const body = await parseBody(request, bodySchema);

  const accessToken = await getValidGbpAccessToken(auth);
  if (!accessToken) {
    throw new ApiError("UNAUTHENTICATED", "Google Business Profile이 연결되어 있지 않습니다.");
  }

  await replyToGbpReview(accessToken, body.reviewName, body.comment);
  return jsonOk({ replied: true });
});
