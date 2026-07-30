import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteAuditCampaigns } from "@/db/schema";
import type { AiBotRule } from "@/server/siteaudit/robots";

/**
 * site_audit_campaigns.crawl_meta JSON 컬럼 접근기.
 * crawl_meta / next_run_at 은 0007 마이그레이션으로 추가됐고
 * drizzle 스키마(domain.ts)에 등재되어 타입 접근한다.
 */

export interface RobotsMeta {
  /** robots.txt 를 실제로 가져오는 데 성공했는지 (404 도 성공 — 규칙 없음으로 해석) */
  ok: boolean;
  robotsUrl: string;
  /** HTTP 상태 코드. 네트워크 실패면 null */
  status: number | null;
  checkedAt: string;
  /** ok=false 일 때 사유 */
  reason?: string;
  bots: AiBotRule[];
}

export interface CrawlMeta {
  robots?: RobotsMeta;
}

function parseCrawlMeta(raw: string | null): CrawlMeta | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as CrawlMeta;
  } catch {
    return null;
  }
}

/** 캠페인의 crawl_meta JSON 을 읽는다. 없거나 깨졌으면 null. */
export async function readCrawlMeta(campaignId: string): Promise<CrawlMeta | null> {
  const [row] = await db
    .select({ crawlMeta: siteAuditCampaigns.crawlMeta })
    .from(siteAuditCampaigns)
    .where(eq(siteAuditCampaigns.id, campaignId))
    .limit(1);
  return parseCrawlMeta(row?.crawlMeta ?? null);
}

/**
 * crawl_meta 의 일부 키만 병합해 저장한다 (읽기-수정-쓰기).
 * 크롤 메타는 크롤 시점 스냅샷이므로 직렬화된 실행 안에서만 호출한다.
 */
export async function mergeCrawlMeta(campaignId: string, patch: CrawlMeta): Promise<void> {
  const current = (await readCrawlMeta(campaignId)) ?? {};
  const next = JSON.stringify({ ...current, ...patch });
  await db
    .update(siteAuditCampaigns)
    .set({ crawlMeta: next })
    .where(eq(siteAuditCampaigns.id, campaignId));
}
