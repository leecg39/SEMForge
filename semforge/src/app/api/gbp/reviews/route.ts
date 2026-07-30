import { jsonOk, route } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { GbpUnavailableError, listGbpReviews } from "@/server/gbp/client";
import { getValidGbpAccessToken } from "@/server/gbp/connections";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");

  const locationName = new URL(request.url).searchParams.get("location");
  if (!locationName) {
    throw new ApiError("VALIDATION_ERROR", "location 파라미터가 필요합니다.", {
      fields: { location: "accounts/{id}/locations/{id} 형식" },
    });
  }

  const accessToken = await getValidGbpAccessToken(auth);
  if (!accessToken) {
    return jsonOk({
      status: "unavailable",
      reason: "Google Business Profile이 연결되어 있지 않습니다.",
      reviews: [],
      averageRating: null,
      totalReviewCount: null,
    });
  }

  try {
    const page = await listGbpReviews(accessToken, locationName);
    return jsonOk({ status: "live", location: locationName, ...page });
  } catch (error) {
    if (error instanceof GbpUnavailableError) {
      return jsonOk({
        status: "unavailable",
        reason: error.message,
        reviews: [],
        averageRating: null,
        totalReviewCount: null,
      });
    }
    throw error;
  }
});
