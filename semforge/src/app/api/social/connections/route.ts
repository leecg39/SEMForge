import { z } from "zod";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { hasRole } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { listGbpAccounts, listGbpLocations } from "@/server/gbp/client";
import {
  getGbpConnection,
  getValidGbpAccessToken,
} from "@/server/gbp/connections";
import { socialFid } from "@/server/social/http";
import {
  disableSocialProfile,
  getSocialSettings,
  upsertSocialProfile,
} from "@/server/social/projects";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("bind_gbp"),
    externalId: z.string().regex(/^(?:accounts\/[^/]+\/)?locations\/[^/]+$/u),
    displayName: z.string().trim().min(1).max(200),
  }),
  z.object({ action: z.literal("disable"), profileId: z.string().min(1) }),
]);
export const dynamic = "force-dynamic";
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  return jsonOk(await getSocialSettings(auth, socialFid(request)));
});
export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  if (!hasRole(auth.role, "admin"))
    throw new ApiError(
      "FORBIDDEN",
      "소셜 프로필 연결은 관리자 이상만 할 수 있습니다.",
    );
  const fid = socialFid(request);
  const input = await parseBody(request, schema);
  if (input.action === "disable") {
    await disableSocialProfile(auth, fid, input.profileId);
    return jsonOk(await getSocialSettings(auth, fid));
  }
  const connection = await getGbpConnection(auth);
  const token = await getValidGbpAccessToken(auth);
  if (!connection || !token)
    throw new ApiError(
      "VALIDATION_ERROR",
      "Google Business Profile 연결이 필요합니다.",
    );
  const accountNames = connection.accountName
    ? [connection.accountName]
    : (await listGbpAccounts(token)).map((account) => account.name);
  const locations = (
    await Promise.all(
      accountNames.map(async (accountName) =>
        (await listGbpLocations(token, accountName)).map((location) => ({
          accountName,
          location,
        })),
      ),
    )
  ).flat();
  const matched = locations.find(
    ({ accountName, location }) =>
      location.name === input.externalId ||
      `${accountName}/${location.name}` === input.externalId,
  );
  if (!matched)
    throw new ApiError(
      "FORBIDDEN",
      "연결된 Google 계정에서 선택한 위치를 확인할 수 없습니다.",
    );
  const externalId = matched.location.name.startsWith("accounts/")
    ? matched.location.name
    : `${matched.accountName}/${matched.location.name}`;
  await upsertSocialProfile(auth, fid, {
    platform: "google_business_profile",
    externalId,
    displayName: matched.location.title || input.displayName,
  });
  return jsonOk(await getSocialSettings(auth, fid));
});
