import { jsonOk, route } from "@/lib/api";
import { deleteGscConnection } from "@/server/gsc/client";

/** Search Console 연결 해제. 저장된 토큰 행을 삭제한다. */
export const dynamic = "force-dynamic";

export const POST = route(async () => {
  deleteGscConnection();
  return jsonOk({ connected: false }, { meta: { source: "google-search-console" } });
});
