import { jsonError, jsonOk, route } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { listDueJobs, runDueJobs } from "@/server/providers/scheduler";
import { ensureDbRetentionJob } from "@/server/providers/retention";
import { ensureSiteAuditDueJob } from "@/server/siteaudit/due";
import { registerPositionTrackingDueJob } from "@/server/position-tracking/schedule";

/**
 * 주기 수집 트리거. 외부 cron/launchd 가 이 엔드포인트를 주기 호출한다.
 * 등록된 due job 이 하나도 없으면 빈 jobs 배열을 정직하게 반환한다.
 *
 * CRON_SECRET 이 설정되어 있으면 x-cron-secret 헤더가 일치해야 한다.
 * (수집 잡은 외부 API 크레딧을 소비하므로 무인증 개방하지 않는다.)
 *
 * 예 (launchd/crontab):
 *   curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/run-due
 *   curl -s -H "x-cron-secret: $CRON_SECRET" "http://localhost:3000/api/cron/run-due?only=site_audit&limit=10"
 */
export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const provided = request.headers.get("x-cron-secret")?.trim();
    if (provided !== cronSecret) {
      return jsonError(new ApiError("UNAUTHENTICATED", "유효한 cron 시크릿이 필요합니다."));
    }
  }

  // 도메인 due job 은 각 모듈의 ensure/register 함수로 등록한다 (멱등).
  // 라우트가 다른 도메인 라우트보다 먼저 호출돼도 잡 누락이 없도록 여기서 보장한다.
  ensureSiteAuditDueJob();
  ensureDbRetentionJob();
  await registerPositionTrackingDueJob();

  const { searchParams } = new URL(request.url);
  const onlyParam = searchParams.get("only")?.trim();
  const limitParam = Number(searchParams.get("limit"));
  const jobs = await runDueJobs({
    only: onlyParam ? onlyParam.split(",").map((name) => name.trim()) : undefined,
    limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
  });

  return jsonOk(
    { jobs },
    {
      meta: {
        source: "due-scheduler",
        registeredJobs: listDueJobs(),
        ranAt: new Date().toISOString(),
      },
    }
  );
});
