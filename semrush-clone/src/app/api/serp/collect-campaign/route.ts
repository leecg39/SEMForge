import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { collectCampaignRankings } from "@/server/talordata/collect";

/** 캠페인 추적 키워드 전체의 실시간 순위 수집. */
const bodySchema = z.object({
  campaignId: z.string().min(1, "캠페인을 선택하세요.").max(64),
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const { campaignId } = await parseBody(request, bodySchema);
  const report = await collectCampaignRankings(auth, campaignId);
  return jsonOk(report, {
    meta: {
      source: "talordata",
      maxKeywordsPerRun: 20,
    },
  });
});
