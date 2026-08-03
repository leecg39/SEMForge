import { jsonError, jsonOk, route } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { verifyCronSecret } from "@/lib/cron-auth";
import { listDueJobs, runDueJobs } from "@/server/providers/scheduler";
import { ensureDbRetentionJob } from "@/server/providers/retention";
import { ensureSiteAuditDueJob } from "@/server/siteaudit/due";
import { registerPositionTrackingDueJob } from "@/server/position-tracking/schedule";
import { registerAiVisibilityDueJob } from "@/server/ai-visibility/schedule";
import { registerContentMediaDueJob } from "@/server/content/media-due";
import { registerSocialDueJob } from "@/server/social/schedule";

/**
 * 주기 수집 트리거. 외부 cron/launchd 가 이 엔드포인트를 주기 호출한다.
 * 등록된 due job 이 하나도 없으면 빈 jobs 배열을 정직하게 반환한다.
 *
 * 이 잡들은 외부 API 크레딧(TalorData/Firecrawl)을 소비하므로 항상
 * x-cron-secret 헤더를 요구한다. CRON_SECRET 미설정은 인증 생략이 아니라
 * 경로 비활성으로 다룬다 (fail-closed).
 *
 * 예 (launchd/crontab):
 *   curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/run-due/
 *   curl -s -H "x-cron-secret: $CRON_SECRET" "http://localhost:3000/api/cron/run-due/?only=site_audit&limit=10"
 */
export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const cronAuth = verifyCronSecret(request);
  if (!cronAuth.ok) {
    return jsonError(
      new ApiError(
        cronAuth.code === "not-configured" ? "FORBIDDEN" : "UNAUTHENTICATED",
        cronAuth.message,
      ),
    );
  }

  // 도메인 due job 은 각 모듈의 ensure/register 함수로 등록한다 (멱등).
  // 라우트가 다른 도메인 라우트보다 먼저 호출돼도 잡 누락이 없도록 여기서 보장한다.
  ensureSiteAuditDueJob();
  ensureDbRetentionJob();
  await registerPositionTrackingDueJob();
  registerAiVisibilityDueJob();
  registerContentMediaDueJob();
  registerSocialDueJob();

  const { searchParams } = new URL(request.url);
  const onlyParam = searchParams.get("only")?.trim();
  const limitParam = Number(searchParams.get("limit"));
  const jobs = await runDueJobs({
    only: onlyParam
      ? onlyParam.split(",").map((name) => name.trim())
      : undefined,
    limit:
      Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
  });

  return jsonOk(
    { jobs },
    {
      meta: {
        source: "due-scheduler",
        registeredJobs: listDueJobs(),
        ranAt: new Date().toISOString(),
      },
    },
  );
});
