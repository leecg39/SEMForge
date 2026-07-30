import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteAuditCampaigns } from "@/db/schema";
import { computeNextRunAt } from "@/server/providers/scheduler";

/**
 * 사이트 진단 캠페인의 반복 스케줄 저장/다음 실행 시각 계산.
 * schedule / next_run_at(0007) 모두 drizzle 스키마에 등재되어 타입 접근한다.
 * 실행 자체는 src/server/siteaudit/due.ts 가 /api/cron/run-due 레지스트리에
 * 등록한 잡이 담당한다.
 */

export const SITE_AUDIT_SCHEDULES = ["off", "daily", "weekly"] as const;
export type SiteAuditSchedule = (typeof SITE_AUDIT_SCHEDULES)[number];

/** 과거 데이터에 남아 있을 수 있는 값 포함, 저장 가능한 전체 주기 */
type StoredSchedule = SiteAuditSchedule | "monthly";

/**
 * 다음 실행 시각. off 면 null (스케줄 해제).
 * daily 는 24시간 뒤, weekly/monthly 는 공용 스케줄러 헬퍼와 같은 규칙(UTC 기준)을 쓴다.
 */
export function computeSiteAuditNextRunAt(
  schedule: StoredSchedule,
  from: Date
): Date | null {
  if (schedule === "daily") {
    const next = new Date(from.getTime());
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (schedule === "weekly" || schedule === "monthly") {
    return computeNextRunAt(schedule, from);
  }
  return null;
}

/**
 * 캠페인의 schedule 과 next_run_at 을 함께 저장한다.
 * 반환값은 UI 가 그대로 보여줄 수 있는 ISO 문자열(또는 null)이다.
 */
export async function setCampaignSchedule(
  campaignId: string,
  schedule: SiteAuditSchedule,
  now = new Date()
): Promise<{ schedule: SiteAuditSchedule; nextRunAt: string | null }> {
  const next = computeSiteAuditNextRunAt(schedule, now);
  const nextMs = next === null ? null : next.getTime();
  await db
    .update(siteAuditCampaigns)
    .set({ schedule, nextRunAt: nextMs, updatedAt: now })
    .where(eq(siteAuditCampaigns.id, campaignId));
  return { schedule, nextRunAt: next === null ? null : next.toISOString() };
}
