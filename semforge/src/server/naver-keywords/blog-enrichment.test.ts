// @TASK NAVER-KI-BLOG-01 - 선택 키워드 블로그 공급량 일괄 보강
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST node:test
import assert from "node:assert/strict";
import { test } from "node:test";
import { NaverApiHubRequestError } from "@/server/naver-api-hub/client";
import type {
  NaverBlogOverview,
  NaverKeywordStat,
} from "@/server/naver-keywords/contracts";
import {
  createNaverKeywordService,
  normalizeBlogEnrichmentKeywords,
  type CachedNaverSection,
  type NaverKeywordServiceStore,
} from "@/server/naver-keywords/service";

class MemoryStore implements NaverKeywordServiceStore {
  readonly searchAds = new Map<string, CachedNaverSection<NaverKeywordStat[]>>();
  readonly insights = new Map<string, CachedNaverSection<unknown>>();

  async readSearchAds(requestKey: string) {
    return this.searchAds.get(requestKey) ?? null;
  }

  async saveSearchAds(input: {
    requestKey: string;
    section: CachedNaverSection<NaverKeywordStat[]>;
  }) {
    this.searchAds.set(input.requestKey, input.section);
    return input.section.data;
  }

  async readInsight<T>(input: { keyword: string; kind: string }) {
    return (this.insights.get(`${input.keyword}:${input.kind}`) as CachedNaverSection<T> | undefined) ?? null;
  }

  async saveInsight<T>(input: {
    keyword: string;
    kind: string;
    section: CachedNaverSection<T>;
  }) {
    this.insights.set(`${input.keyword}:${input.kind}`, input.section);
  }
}

const now = new Date("2026-08-04T00:00:00.000Z");

function blogResult(keyword: string, total: number) {
  return {
    query: keyword,
    total,
    start: 1,
    display: 3,
    lastBuildDate: null,
    items: [],
    capturedAt: now.toISOString(),
    source: "naver-api-hub-blog-search" as const,
  };
}

function serviceWith(input?: {
  store?: MemoryStore;
  fetchBlog?: (keyword: string) => Promise<ReturnType<typeof blogResult>>;
  calls?: { searchAds: number; trend: number; blog: number };
}) {
  const calls = input?.calls ?? { searchAds: 0, trend: 0, blog: 0 };
  const store = input?.store ?? new MemoryStore();
  const service = createNaverKeywordService({
    store,
    providers: {
      fetchSearchAds: async () => {
        calls.searchAds += 1;
        throw new Error("Search Ads는 블로그 보강에서 호출되면 안 됩니다.");
      },
      fetchTrend: async () => {
        calls.trend += 1;
        throw new Error("Search Trend는 블로그 보강에서 호출되면 안 됩니다.");
      },
      fetchBlog: async (keyword) => {
        calls.blog += 1;
        return input?.fetchBlog
          ? input.fetchBlog(keyword)
          : blogResult(keyword, keyword === "첫 키워드" ? 101 : 202);
      },
    },
    executor: {
      searchAds: async <T>(task: () => Promise<T>) => task(),
      apiHub: async <T>(task: () => Promise<T>) => task(),
    },
    now: () => now,
  });
  return { service, store, calls };
}

test("블로그 보강 입력은 NFKC·공백 정규화 후 중복을 제거하고 최대 20개로 제한한다", () => {
  assert.deepEqual(
    normalizeBlogEnrichmentKeywords(["  첫\u3000키워드 ", "첫 키워드", "Ａ 키워드", "A 키워드"]),
    ["첫 키워드", "A 키워드"],
  );
  assert.throws(() => normalizeBlogEnrichmentKeywords([]), /1개 이상/);
  assert.throws(
    () => normalizeBlogEnrichmentKeywords(Array.from({ length: 21 }, (_, index) => `키워드 ${index}`)),
    /20개 이하/,
  );
});

test("선택 키워드 보강은 Blog Search만 호출하고 각 키워드의 출처·캐시 메타를 보존한다", async () => {
  const { service, calls } = serviceWith();
  const report = await service.blogEnrichment(["첫 키워드", "둘째 키워드"]);

  assert.deepEqual(calls, { searchAds: 0, trend: 0, blog: 2 });
  assert.deepEqual(report.keywords, ["첫 키워드", "둘째 키워드"]);
  assert.equal(report.results.length, 2);
  assert.equal(report.results[0].blog.status, "live");
  assert.equal(report.results[0].blog.source, "naver-api-hub-blog-search");
  assert.equal(report.results[0].blog.cache, "fresh");
  assert.ok(report.results[0].blog.status === "live");
  assert.equal(report.results[0].blog.data.total, 101);
});

test("신선한 Blog Search 캐시는 외부 호출 없이 사용한다", async () => {
  const store = new MemoryStore();
  const cached: CachedNaverSection<NaverBlogOverview> = {
    data: { total: 77, items: [], resultLabel: "네이버 블로그 검색 API 응답 예시" },
    source: "naver-api-hub-blog-search",
    fetchedAt: new Date("2026-08-03T12:00:00.000Z"),
    expiresAt: new Date("2026-08-04T12:00:00.000Z"),
    cache: "fresh",
  };
  store.insights.set("캐시 키워드:blog_search", cached);
  const { service, calls } = serviceWith({ store });

  const report = await service.blogEnrichment(["캐시 키워드"]);

  assert.equal(calls.blog, 0);
  assert.equal(report.results[0].blog.status, "live");
  assert.equal(report.results[0].blog.cache, "fresh");
});

test("키워드별 실패는 부분 응답을 유지하고 장애 시 stale 캐시를 명시한다", async () => {
  const store = new MemoryStore();
  store.insights.set("오래된 키워드:blog_search", {
    data: { total: 33, items: [], resultLabel: "네이버 블로그 검색 API 응답 예시" },
    source: "naver-api-hub-blog-search",
    fetchedAt: new Date("2026-07-30T00:00:00.000Z"),
    expiresAt: new Date("2026-07-31T00:00:00.000Z"),
    cache: "stale",
  } satisfies CachedNaverSection<NaverBlogOverview>);
  const { service } = serviceWith({
    store,
    fetchBlog: async (keyword) => {
      if (keyword === "정상 키워드") return blogResult(keyword, 55);
      throw new NaverApiHubRequestError("원시 공급자 오류", "provider", 500);
    },
  });

  const report = await service.blogEnrichment(["정상 키워드", "실패 키워드", "오래된 키워드"]);

  assert.equal(report.results[0].blog.status, "live");
  assert.equal(report.results[1].blog.status, "error");
  assert.doesNotMatch(report.results[1].blog.reason ?? "", /500|원시/);
  assert.equal(report.results[2].blog.status, "live");
  assert.equal(report.results[2].blog.cache, "stale");
  assert.match(report.results[2].blog.reason ?? "", /최근 30일 이내 캐시/);
});

test("overview는 비교 가능한 audience share가 없어 인구통계를 명시적 unavailable로 반환한다", async () => {
  const { service } = serviceWith();
  const report = await service.overview("인구통계 확인");

  assert.equal(report.demographics.status, "unavailable");
  assert.equal(report.demographics.measurement, "relative");
  assert.equal(report.demographics.source, "naver-api-hub-search-trend");
  assert.match(report.demographics.reason ?? "", /비교 가능한.*비율|audience share/i);
  assert.equal("data" in report.demographics, false);
});
