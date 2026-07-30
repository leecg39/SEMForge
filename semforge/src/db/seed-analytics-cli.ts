import { db } from "@/db/client";
import {
  clickstreamEvents,
  keywordMetrics,
  linkGraphEdges,
  serpSnapshots,
} from "@/db/schema";
import { seedAnalyticsData } from "@/db/seed-analytics";

/**
 * 기존 계정·워크스페이스·CRUD 데이터는 보존하고 분석 데모 원천만 교체한다.
 * 데모 데이터는 가짜 지표이므로 SEED_DEMO_DATA=1 플래그가 있을 때만 동작한다
 * (npm run db:seed:analytics 가 플래그를 켜고 이 파일을 실행한다).
 */
async function main() {
  if (process.env.SEED_DEMO_DATA !== "1") {
    console.log("[seed:analytics] 생략 — 데모 분석 데이터는 SEED_DEMO_DATA=1 일 때만 삽입됩니다.");
    return;
  }
  await db.delete(serpSnapshots);
  await db.delete(clickstreamEvents);
  await db.delete(linkGraphEdges);
  await db.delete(keywordMetrics);
  await seedAnalyticsData();
  console.log("[seed:analytics] 분석 데모 데이터 갱신 완료 (데모 전용 — 실제 지표는 TalorData/Firecrawl 수집 사용)");
}

main().catch((error) => {
  console.error("[seed:analytics] 실패", error);
  process.exit(1);
});
