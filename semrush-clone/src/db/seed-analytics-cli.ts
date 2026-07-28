import { db } from "@/db/client";
import {
  clickstreamEvents,
  keywordMetrics,
  linkGraphEdges,
  serpSnapshots,
} from "@/db/schema";
import { seedAnalyticsData } from "@/db/seed-analytics";

/** 기존 계정·워크스페이스·CRUD 데이터는 보존하고 분석 데모 원천만 교체한다. */
async function main() {
  await db.delete(serpSnapshots);
  await db.delete(clickstreamEvents);
  await db.delete(linkGraphEdges);
  await db.delete(keywordMetrics);
  await seedAnalyticsData();
  console.log("[seed:analytics] 분석 데모 데이터 갱신 완료");
}

main().catch((error) => {
  console.error("[seed:analytics] 실패", error);
  process.exit(1);
});
