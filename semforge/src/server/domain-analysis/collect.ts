import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";
import type {
  AnalyticsDevice,
  DomainAnalyticsReport,
  DomainExternalAnalysis,
  DomainProviderState,
  DomainSiteProfile,
} from "@/lib/analytics/types";
import { getDomainAnalytics } from "@/server/analytics";
import { discoverDomainSite } from "@/server/domain-analysis/discovery";
import { saveDomainExternalAnalysis } from "@/server/domain-analysis/snapshots";
import { runPageSpeedInsights } from "@/server/psi/client";
import {
  collectDomainSeedKeywords,
  suggestDomainKeywords,
  type DomainSeedCollectReport,
} from "@/server/talordata/collect";

const MAX_ANALYSIS_KEYWORDS = 5;

function providerState(
  source: DomainProviderState["source"],
  status: DomainProviderState["status"],
  input?: { reason?: string; records?: number; fetchedAt?: string },
): DomainProviderState {
  return {
    source,
    status,
    fetchedAt: input?.fetchedAt ?? new Date().toISOString(),
    ...(input?.reason ? { reason: input.reason } : {}),
    ...(input?.records === undefined ? {} : { records: input.records }),
  };
}

function publicError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export interface DomainAnalysisCollectionResult {
  report: DomainAnalyticsReport;
  collection: DomainSeedCollectReport;
}

/**
 * 도메인 개요의 실데이터 수집 오케스트레이터.
 * Firecrawl/PSI는 병렬 실행하고, 실제 페이지에서 발견한 키워드를 TalorData SERP로
 * 확인한다. 공급자 하나가 실패해도 나머지 성공 결과를 보존한다.
 */
export async function collectDomainAnalysis(input: {
  domain: string;
  countryCode: string;
  device: AnalyticsDevice;
  keywords?: string[];
}): Promise<DomainAnalysisCollectionResult> {
  const domain = normalizeDomain(input.domain);
  if (!domain || !domain.includes(".")) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인을 입력해 주세요.", {
      fields: { domain: "예: example.com" },
    });
  }
  const countryCode = input.countryCode.toUpperCase();
  const siteUrl = `https://${domain}/`;
  const firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim();
  const pagespeedKey = process.env.PAGESPEED_API_KEY?.trim();

  const [siteSettled, performanceSettled] = await Promise.allSettled([
    firecrawlKey
      ? discoverDomainSite(domain, firecrawlKey)
      : Promise.reject(new Error("FIRECRAWL_API_KEY가 설정되지 않았습니다.")),
    pagespeedKey
      ? runPageSpeedInsights({ url: siteUrl, strategy: input.device })
      : Promise.reject(new Error("PAGESPEED_API_KEY가 설정되지 않았습니다.")),
  ]);

  const site: DomainSiteProfile | null =
    siteSettled.status === "fulfilled" ? siteSettled.value : null;
  const supplied = (input.keywords ?? []).map((keyword) => keyword.trim()).filter(Boolean);
  const keywordCandidates = [
    ...supplied,
    ...(site?.keywordCandidates ?? []),
    ...suggestDomainKeywords(domain),
  ]
    .filter((keyword, index, list) => list.indexOf(keyword) === index)
    .slice(0, MAX_ANALYSIS_KEYWORDS);

  let collection: DomainSeedCollectReport;
  let talordataState: DomainProviderState;
  try {
    collection = await collectDomainSeedKeywords({
      domain,
      countryCode,
      device: input.device,
      keywords: keywordCandidates,
      num: 100,
    });
    talordataState = providerState(
      "talordata",
      collection.collected > 0 ? "live" : "error",
      {
        fetchedAt: collection.capturedAt,
        records: collection.collected,
        ...(collection.collected === 0
          ? { reason: collection.outcomes[0]?.error ?? "SERP를 수집하지 못했습니다." }
          : collection.failed > 0
            ? { reason: `${collection.failed}개 키워드 수집 실패` }
            : {}),
      },
    );
  } catch (error) {
    const reason = publicError(error, "TalorData SERP 수집에 실패했습니다.");
    collection = {
      domain,
      countryCode,
      device: input.device,
      collected: 0,
      failed: keywordCandidates.length,
      ranked: 0,
      outcomes: keywordCandidates.map((keyword) => ({
        keyword,
        position: null,
        url: null,
        error: reason,
      })),
      capturedAt: new Date().toISOString(),
    };
    talordataState = providerState(
      "talordata",
      process.env.TALORDATA_API_TOKEN?.trim() ? "error" : "unavailable",
      { reason },
    );
  }

  const capturedAt = new Date().toISOString();
  const external: DomainExternalAnalysis = {
    domain,
    countryCode,
    device: input.device,
    capturedAt,
    keywordCandidates,
    providers: {
      talordata: talordataState,
      firecrawl:
        siteSettled.status === "fulfilled"
          ? providerState("firecrawl", "live", {
              records: siteSettled.value.successfulPages,
              fetchedAt: capturedAt,
            })
          : providerState("firecrawl", firecrawlKey ? "error" : "unavailable", {
              reason: publicError(siteSettled.reason, "Firecrawl 수집에 실패했습니다."),
            }),
      pagespeed:
        performanceSettled.status === "fulfilled"
          ? providerState("pagespeed-insights", "live", {
              records: 1,
              fetchedAt: performanceSettled.value.fetchedAt.toISOString(),
            })
          : providerState("pagespeed-insights", pagespeedKey ? "error" : "unavailable", {
              reason: publicError(
                performanceSettled.reason,
                "PageSpeed Insights 수집에 실패했습니다.",
              ),
            }),
    },
    site,
    performance:
      performanceSettled.status === "fulfilled"
        ? {
            url: performanceSettled.value.url,
            strategy: performanceSettled.value.strategy,
            scores: performanceSettled.value.scores,
            cwv: performanceSettled.value.cwv,
          }
        : null,
  };

  await saveDomainExternalAnalysis(external);
  const report = await getDomainAnalytics({ domain, countryCode, device: input.device });
  if (!report) {
    throw new ApiError("INTERNAL", "외부 분석 결과를 저장했지만 리포트를 만들지 못했습니다.");
  }
  return { report, collection };
}
