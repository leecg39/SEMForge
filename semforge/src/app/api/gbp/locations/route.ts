import { jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { GbpUnavailableError, listGbpAccounts, listGbpLocations } from "@/server/gbp/client";
import { getValidGbpAccessToken } from "@/server/gbp/connections";
import { getGbpConnection } from "@/server/gbp/connections";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");

  const connection = await getGbpConnection(auth);
  if (!connection) {
    return jsonOk({ status: "unavailable", reason: "Google Business Profile이 연결되어 있지 않습니다.", locations: [] });
  }

  const accessToken = await getValidGbpAccessToken(auth);
  if (!accessToken) {
    return jsonOk({ status: "unavailable", reason: "Google Business Profile이 연결되어 있지 않습니다.", locations: [] });
  }

  try {
    let accountName = connection.accountName;
    if (!accountName) {
      const accounts = await listGbpAccounts(accessToken);
      accountName = accounts[0]?.name ?? null;
      if (!accountName) {
        return jsonOk({
          status: "live",
          reason: "연결된 Google 계정에 Business Profile 계정이 없습니다.",
          locations: [],
        });
      }
    }

    const locations = await listGbpLocations(accessToken, accountName);
    return jsonOk({ status: "live", accountName, locations });
  } catch (error) {
    // 할당량 0(액세스 미승인)·API 미활성은 오류가 아니라 정직한 미제공 상태다.
    if (error instanceof GbpUnavailableError) {
      return jsonOk({ status: "unavailable", reason: error.message, locations: [] });
    }
    throw error;
  }
});
