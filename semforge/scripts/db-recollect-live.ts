import { loadEnvConfig } from "@next/env";

// tsx 는 Next 런타임 밖이라 .env.local 을 직접 로드해야 한다 (TALORDATA_API_TOKEN).
loadEnvConfig(process.cwd());

import { and, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { positionTrackingCampaigns } from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import {
  collectCampaignRankings,
  collectDomainSeedKeywords,
} from "@/server/talordata/collect";

/**
 * 실측 SERP 스냅샷 재수집 스크립트 (일회성 복구/재적재용).
 * `npx tsx scripts/db-recollect-live.ts` 로 실행한다.
 *
 * 실제 도메인(.example.com 제외)의 포지션 추적 캠페인 순위와
 * 도메인 개요 시드 키워드를 TalorData 로 다시 수집해 serp_snapshots 를 채운다.
 * TTL(24h) 캐시를 그대로 따르므로 이미 신선한 스냅샷이 있으면 과금되지 않는다.
 */

function cronAuth(workspaceId: string, createdBy: string | null): AuthContext {
  return {
    userId: createdBy ?? "system-recollect",
    email: "recollect@localhost",
    name: "실측 재수집 스크립트",
    workspaceId,
    workspaceName: "",
    workspacePlan: "pro",
    role: "editor",
    sessionId: "recollect",
    ip: null,
    userAgent: null,
  };
}

async function main() {
  const campaigns = await db
    .select({
      id: positionTrackingCampaigns.id,
      name: positionTrackingCampaigns.name,
      domain: positionTrackingCampaigns.domain,
      workspaceId: positionTrackingCampaigns.workspaceId,
      createdBy: positionTrackingCampaigns.createdBy,
      searchEngine: positionTrackingCampaigns.searchEngine,
    })
    .from(positionTrackingCampaigns)
    .where(
      and(
        isNull(positionTrackingCampaigns.deletedAt),
        ne(positionTrackingCampaigns.searchEngine, "chatgpt")
      )
    );

  const realCampaigns = campaigns.filter(
    (campaign) => !campaign.domain.endsWith(".example.com")
  );
  console.log(
    `[recollect] 캠페인 ${campaigns.length}개 중 실제 도메인 ${realCampaigns.length}개 수집`
  );

  for (const campaign of realCampaigns) {
    try {
      const report = await collectCampaignRankings(
        cronAuth(campaign.workspaceId, campaign.createdBy),
        campaign.id
      );
      console.log(
        `[recollect] ${campaign.name} (${campaign.domain}): 수집 ${report.collected}, 실패 ${report.failed}, 가시성 ${report.visibility}%`
      );
    } catch (error) {
      console.error(
        `[recollect] ${campaign.name} 실패:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // 도메인 개요 실측 시드 (실사용 도메인)
  for (const domain of ["mega-info.co.kr"]) {
    try {
      const report = await collectDomainSeedKeywords({
        domain,
        countryCode: "KR",
        device: "desktop",
      });
      console.log(
        `[recollect] 도메인 시드 ${domain}: 수집 ${report.collected}, 순위 확인 ${report.ranked}`
      );
    } catch (error) {
      console.error(
        `[recollect] 도메인 시드 ${domain} 실패:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log("[recollect] 완료");
}

main().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
