import { ApiError, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  completeMetaConnection,
  verifyMetaOAuthState,
} from "@/server/social/meta-oauth";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const { folderId } = verifyMetaOAuthState(auth, state);
  if (url.searchParams.get("error"))
    return Response.redirect(
      new URL(
        `/social-media/?fid=${encodeURIComponent(folderId)}&meta=denied`,
        url.origin,
      ),
      302,
    );
  const code = url.searchParams.get("code");
  if (!code)
    throw new ApiError("VALIDATION_ERROR", "Meta 인증 코드가 없습니다.");
  await completeMetaConnection(auth, folderId, code);
  return Response.redirect(
    new URL(
      `/social-media/?fid=${encodeURIComponent(folderId)}&meta=connected#connections`,
      url.origin,
    ),
    302,
  );
});
