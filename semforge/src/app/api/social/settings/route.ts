import { z } from "zod";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { assertCan, hasRole } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { socialFid } from "@/server/social/http";
import {
  getSocialSettings,
  updateSocialSettings,
} from "@/server/social/projects";

const schema = z.object({
  timezone: z.string().trim().min(1).max(80),
  approvalRequired: z.boolean(),
  syncEnabled: z.boolean(),
});
export const dynamic = "force-dynamic";
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  return jsonOk(await getSocialSettings(auth, socialFid(request)));
});
export const PUT = route(async (request: Request) => {
  const auth = await requireAuth(request);
  if (!hasRole(auth.role, "admin"))
    throw new ApiError(
      "FORBIDDEN",
      "소셜 설정은 관리자 이상만 변경할 수 있습니다.",
    );
  return jsonOk(
    await updateSocialSettings(
      auth,
      socialFid(request),
      await parseBody(request, schema),
    ),
  );
});
