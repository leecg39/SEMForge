import { z } from "zod";
import {
  MAX_GAP_TARGETS,
  parseGapTargetParam,
  type GapTarget,
} from "@/lib/analytics/keyword-gap";
import { ApiError, jsonOk, route } from "@/lib/api";
import { getKeywordGap } from "@/server/keyword-gap";

const querySchema = z.object({
  country: z.string().trim().length(2).default("KR"),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
});

/**
 * GET /api/analytics/keyword-gap/?you=me.com&c1=rival.com&c2=sub:blog.b.com&country=KR
 * 대상 값 형식은 `[scope:]value` — scope 는 sub|folder|url, 생략 시 root 도메인.
 */
export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    country: url.searchParams.get("country") ?? undefined,
    device: url.searchParams.get("device") ?? undefined,
  });
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "비교 조건을 확인해 주세요.", {
      fields: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join(".") || "_root", issue.message]),
      ),
    });
  }

  const you = parseGapTargetParam(url.searchParams.get("you"));
  if (!you) {
    throw new ApiError("VALIDATION_ERROR", "나의 도메인을 입력해 주세요.", {
      fields: { you: "예: example.com" },
    });
  }
  const competitors: GapTarget[] = [];
  for (let index = 1; index < MAX_GAP_TARGETS; index += 1) {
    const target = parseGapTargetParam(url.searchParams.get(`c${index}`));
    if (target) competitors.push(target);
  }
  if (competitors.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "경쟁자 도메인을 1개 이상 입력해 주세요.", {
      fields: { c1: "예: competitor.com" },
    });
  }

  const report = await getKeywordGap({
    targets: [you, ...competitors],
    countryCode: parsed.data.country.toUpperCase(),
    device: parsed.data.device,
  });

  return jsonOk(report, {
    meta: {
      generatedFrom: ["keyword_metrics", "serp_snapshots", "link_graph_edges"],
      rawIdentifiersExposed: false,
    },
  });
});
