import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getMonitoredDomains } from "@/server/home";

/**
 * 홈 "모니터링할 도메인" 아코디언.
 * 사이트 감사 또는 활성 순위 추적 캠페인이 설정된 도메인을 도구별로 묶어 반환한다.
 */
export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const domains = await getMonitoredDomains(auth);
  return jsonOk(domains, {
    meta: {
      sources: ["site_audit_campaigns", "position_tracking_campaigns"],
    },
  });
});
