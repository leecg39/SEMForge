// @TASK NAVER-KI-SVC-04 - 실제 공급자/DB 런타임 조립
// @SPEC user-approved-plan#3-a-official-data-collection
import {
  fetchNaverBlogSearch,
  fetchNaverSearchTrend,
  hasNaverApiHubCredentials,
} from "@/server/naver-api-hub/client";
import {
  fetchNaverRelatedKeywords,
  hasNaverSearchAdsCredentials,
} from "@/server/naver-search-ads/client";
import { NaverProviderExecutionController } from "@/server/naver-keywords/execution";
import { createNaverKeywordService } from "@/server/naver-keywords/service";
import {
  DbProviderBudgetRepository,
  NaverKeywordDbStore,
} from "@/server/naver-keywords/store";

const store = new NaverKeywordDbStore();
const executor = new NaverProviderExecutionController(new DbProviderBudgetRepository());

export const naverKeywordService = createNaverKeywordService({
  store,
  executor,
  providers: {
    hasSearchAdsCredentials: () => hasNaverSearchAdsCredentials(),
    hasApiHubCredentials: () => hasNaverApiHubCredentials(),
    fetchSearchAds: (seeds) => fetchNaverRelatedKeywords(seeds),
    fetchTrend: (keyword) => fetchNaverSearchTrend({
      keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      timeUnit: "month",
    }),
    fetchBlog: (keyword) => fetchNaverBlogSearch({
      query: keyword,
      display: 3,
      start: 1,
      sort: "sim",
    }),
  },
});
