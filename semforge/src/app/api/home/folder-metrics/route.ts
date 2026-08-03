import { z } from "zod";
import { ApiError, jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getFolderMetricStrips } from "@/server/home";

/**
 * 홈 폴더 행 지표 스트립.
 * folderIds 미지정 시 워크스페이스의 활성 폴더 전체를 반환한다.
 */

const MAX_FOLDER_IDS = 100;

const querySchema = z.object({
  folderIds: z
    .string()
    .transform((raw) =>
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1).max(64)).max(MAX_FOLDER_IDS))
    .optional(),
});

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    folderIds: url.searchParams.get("folderIds") ?? undefined,
  });
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "폴더 식별자를 확인해 주세요.", {
      fields: { folderIds: "쉼표로 구분된 폴더 ID 목록이어야 합니다." },
    });
  }

  const strips = await getFolderMetricStrips(auth, parsed.data.folderIds);
  return jsonOk(strips, {
    meta: {
      analyticsScope: { country: "US", device: "desktop" },
      sources: [
        "ai_visibility_queries",
        "ai_visibility_snapshots",
        "ai_visibility_runs",
        "ai_visibility_observations",
        "ai_visibility_citations",
        "site_audit_campaigns",
        "position_tracking_campaigns",
        "keyword_metrics",
        "serp_snapshots",
        "link_graph_edges",
      ],
    },
  });
});
