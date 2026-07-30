import { z } from "zod";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { ApiError, jsonOk, route } from "@/lib/api";
import { getDomainAnalytics } from "@/server/analytics";

const querySchema = z.object({
  domain: z.string().trim().min(1).max(253),
  country: z.string().trim().length(2).default("US"),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
});

export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    domain: url.searchParams.get("domain") ?? "",
    country: url.searchParams.get("country") ?? undefined,
    device: url.searchParams.get("device") ?? undefined,
  });
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "분석 조건을 확인해 주세요.", {
      fields: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join(".") || "_root", issue.message]),
      ),
    });
  }

  const domain = normalizeDomain(parsed.data.domain);
  if (!domain || !domain.includes(".")) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인을 입력해 주세요.", {
      fields: { domain: "예: northwind.example.com" },
    });
  }

  const report = await getDomainAnalytics({
    domain,
    countryCode: parsed.data.country.toUpperCase(),
    device: parsed.data.device,
  });
  if (!report) {
    throw new ApiError(
      "NOT_FOUND",
      "이 도메인은 아직 원천 스토어에 데이터가 없습니다. 실시간 수집으로 리포트를 만들 수 있습니다."
    );
  }

  return jsonOk(report, {
    meta: {
      generatedFrom: [
        "keyword_metrics",
        "serp_snapshots",
        "clickstream_events",
        "link_graph_edges",
      ],
      rawIdentifiersExposed: false,
    },
  });
});
