import assert from "node:assert/strict";
import { test } from "node:test";
import { NaverApiHubRequestError } from "@/server/naver-api-hub/client";
import {
  NaverSearchAdsUnavailableError,
  parseNaverQueryCount,
  sumNaverQueryCounts,
} from "@/server/naver-search-ads/client";
import { allSectionsFailed, type NaverKeywordStat } from "@/server/naver-keywords/contracts";
import {
  createNaverKeywordService,
  type CachedNaverSection,
  type NaverKeywordServiceStore,
} from "@/server/naver-keywords/service";

class MemoryStore implements NaverKeywordServiceStore {
  searchAds = new Map<string, CachedNaverSection<NaverKeywordStat[]>>();
  insights = new Map<string, CachedNaverSection<unknown>>();

  async readSearchAds(requestKey: string) {
    return this.searchAds.get(requestKey) ?? null;
  }

  async saveSearchAds(input: { requestKey: string; section: CachedNaverSection<NaverKeywordStat[]> }) {
    const data = input.section.data.map((row, index) => ({
      ...row,
      snapshotId: row.monthlyPcQueries && row.monthlyMobileQueries ? `snapshot-${index}` : null,
    }));
    this.searchAds.set(input.requestKey, { ...input.section, data });
    return data;
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
const exact = (value: number) => {
  const count = parseNaverQueryCount(value);
  assert.ok(count?.relation === "exact");
  return count;
};

function related(keyword: string, total: number) {
  const pc = exact(Math.floor(total / 2));
  const mobile = exact(total - pc.value);
  return {
    snapshotId: null,
    keyword,
    monthlyPcQueries: pc,
    monthlyMobileQueries: mobile,
    monthlyTotalQueries: sumNaverQueryCounts([pc, mobile]),
    monthlyAveragePcClicks: 3.2,
    monthlyAverageMobileClicks: 5.1,
    monthlyAveragePcCtr: 1.4,
    monthlyAverageMobileCtr: 2.1,
    averageAdDepth: 7,
    competition: "medium" as const,
    competitionLabel: "중간",
  };
}

function providers() {
  return {
    fetchSearchAds: async (seeds: readonly string[]) => ({
      seedKeywords: [...seeds],
      keywords: [related(seeds[0], 1_000), related(`${seeds[0]} 비용`, 300)],
      capturedAt: now.toISOString(),
      source: "naver-search-ads-relkwdstat" as const,
    }),
    fetchTrend: async (keyword: string) => ({
      startDate: "2025-08-04",
      endDate: "2026-08-04",
      timeUnit: "month" as const,
      results: [{ title: keyword, keywords: [keyword], data: [{ period: "2026-08-01", ratio: 72.5 }] }],
      capturedAt: now.toISOString(),
      source: "naver-api-hub-search-trend" as const,
    }),
    fetchBlog: async (keyword: string) => ({
      query: keyword,
      total: 432,
      start: 1,
      display: 3,
      lastBuildDate: null,
      items: [{
        title: "공식 응답 제목",
        link: "https://blog.naver.com/example/1",
        description: null,
        bloggerName: null,
        bloggerLink: null,
        postDate: "20260804",
      }],
      capturedAt: now.toISOString(),
      source: "naver-api-hub-blog-search" as const,
    }),
  };
}

const directExecutor = {
  searchAds: async <T>(task: () => Promise<T>) => task(),
  apiHub: async <T>(task: () => Promise<T>) => task(),
};

test("overview는 세 공급자 결과를 출처가 있는 독립 봉투로 조합한다", async () => {
  const service = createNaverKeywordService({
    store: new MemoryStore(),
    providers: providers(),
    executor: directExecutor,
    now: () => now,
  });
  const report = await service.overview("  네이버\u3000광고 ");

  assert.equal(report.keyword, "네이버 광고");
  assert.equal(report.searchAds.status, "live");
  assert.ok(report.searchAds.status === "live");
  assert.equal(report.searchAds.measurement, "absolute");
  assert.equal(report.searchAds.data.primary?.monthlyTotalQueries?.display, "1,000");
  assert.equal(report.searchAds.data.primary?.snapshotId, "snapshot-0");
  assert.equal(report.searchAds.data?.relatedKeywords.length, 1);
  assert.equal(report.trend.status, "live");
  assert.equal(report.trend.measurement, "relative");
  assert.ok(report.blog.status === "live");
  assert.equal(report.blog.data.resultLabel, "네이버 블로그 검색 API 응답 예시");
  assert.equal("position" in (report.blog.data.items[0] ?? {}), false);
});

test("한 공급자 실패는 다른 live 섹션을 보존해 부분 성공한다", async () => {
  const base = providers();
  const service = createNaverKeywordService({
    store: new MemoryStore(),
    providers: {
      ...base,
      fetchSearchAds: async () => { throw new NaverSearchAdsUnavailableError(); },
    },
    executor: directExecutor,
    now: () => now,
  });
  const report = await service.overview("부분 성공");

  assert.equal(report.searchAds.status, "unavailable");
  assert.equal(report.trend.status, "live");
  assert.equal(report.blog.status, "live");
  assert.equal(allSectionsFailed([report.searchAds, report.trend, report.blog]), false);
});

test("세 공급자가 모두 실패하면 전체 실패로 판정한다", async () => {
  const service = createNaverKeywordService({
    store: new MemoryStore(),
    providers: {
      fetchSearchAds: async () => { throw new NaverSearchAdsUnavailableError(); },
      fetchTrend: async () => { throw new NaverApiHubRequestError("실패", "provider", 500); },
      fetchBlog: async () => { throw new NaverApiHubRequestError("실패", "provider", 500); },
    },
    executor: directExecutor,
    now: () => now,
  });
  const report = await service.overview("전체 실패");

  assert.equal(allSectionsFailed([report.searchAds, report.trend, report.blog]), true);
  assert.equal(report.trend.status, "error");
  assert.doesNotMatch(report.trend.reason ?? "", /500/);
});

test("신선한 캐시는 외부 호출 없이 사용하고, stale 캐시는 장애 시 명시적으로 대체한다", async () => {
  const store = new MemoryStore();
  const stat: NaverKeywordStat = {
    ...related("캐시 키워드", 90),
    normalizedKeyword: "캐시 키워드",
  };
  store.searchAds.set("캐시 키워드", {
    data: [stat],
    source: "naver-search-ads-relkwdstat",
    fetchedAt: new Date("2026-08-01T00:00:00.000Z"),
    expiresAt: new Date("2026-08-08T00:00:00.000Z"),
    cache: "fresh",
  });
  let calls = 0;
  const service = createNaverKeywordService({
    store,
    providers: {
      ...providers(),
      fetchSearchAds: async () => {
        calls += 1;
        throw new NaverApiHubRequestError("공급자 내부", "provider", 500);
      },
    },
    executor: directExecutor,
    now: () => now,
  });

  const fresh = await service.overview("캐시 키워드");
  assert.equal(calls, 0);
  assert.equal(fresh.searchAds.cache, "fresh");

  const cached = store.searchAds.get("캐시 키워드")!;
  cached.cache = "stale";
  cached.expiresAt = new Date("2026-08-03T00:00:00.000Z");
  const stale = await service.overview("캐시 키워드");
  assert.equal(calls, 1);
  assert.equal(stale.searchAds.status, "live");
  assert.equal(stale.searchAds.cache, "stale");
  assert.match(stale.searchAds.reason ?? "", /캐시/);
});

test("explore는 검색량 하한 내림차순·키워드 오름차순으로 최대 1000개를 반환한다", async () => {
  const source = providers();
  const service = createNaverKeywordService({
    store: new MemoryStore(),
    providers: {
      ...source,
      fetchSearchAds: async (seeds) => ({
        seedKeywords: [...seeds],
        keywords: [related("나", 20), related("가", 20), related("다", 30)],
        capturedAt: now.toISOString(),
        source: "naver-search-ads-relkwdstat" as const,
      }),
    },
    executor: directExecutor,
    now: () => now,
  });
  const report = await service.explore(["검색"]);

  assert.equal(report.keywords.status, "live");
  assert.deepEqual(report.keywords.data?.map((row) => row.keyword), ["다", "가", "나"]);
});

test("동일 키의 동시 cache miss는 searchAds/trend/blog 각각 한 공급자 호출만 공유한다", async () => {
  const calls = { searchAds: 0, trend: 0, blog: 0 };
  const base = providers();
  const pause = () => new Promise((resolve) => setTimeout(resolve, 10));
  const service = createNaverKeywordService({
    store: new MemoryStore(),
    providers: {
      fetchSearchAds: async (seeds) => {
        calls.searchAds += 1;
        await pause();
        return base.fetchSearchAds(seeds);
      },
      fetchTrend: async (keyword) => {
        calls.trend += 1;
        await pause();
        return base.fetchTrend(keyword);
      },
      fetchBlog: async (keyword) => {
        calls.blog += 1;
        await pause();
        return base.fetchBlog(keyword);
      },
    },
    executor: directExecutor,
    now: () => now,
  });

  await Promise.all([service.overview("single flight"), service.overview("single flight")]);
  assert.deepEqual(calls, { searchAds: 1, trend: 1, blog: 1 });
});

test("single-flight 실패도 map에서 제거되어 다음 요청이 새로 수집한다", async () => {
  let calls = 0;
  const base = providers();
  const service = createNaverKeywordService({
    store: new MemoryStore(),
    providers: {
      ...base,
      fetchSearchAds: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new NaverSearchAdsUnavailableError();
      },
    },
    executor: directExecutor,
    now: () => now,
  });

  await Promise.all([service.explore(["실패 공유"]), service.explore(["실패 공유"])]);
  assert.equal(calls, 1);
  await service.explore(["실패 공유"]);
  assert.equal(calls, 2);
});

test("RelKwdStat가 seed 공백을 제거해도 overview primary를 정확히 연결한다", async () => {
  const base = providers();
  const service = createNaverKeywordService({
    store: new MemoryStore(),
    providers: {
      ...base,
      fetchSearchAds: async (seeds) => ({
        seedKeywords: [...seeds],
        keywords: [related("네이버광고", 1_200), related("네이버 광고 비용", 400)],
        capturedAt: now.toISOString(),
        source: "naver-search-ads-relkwdstat" as const,
      }),
    },
    executor: directExecutor,
    now: () => now,
  });

  const report = await service.overview("네이버 광고");
  assert.ok(report.searchAds.status === "live");
  assert.equal(report.searchAds.data.primary?.keyword, "네이버광고");
  assert.equal(report.searchAds.data.primary?.normalizedKeyword, "네이버광고");
  assert.equal(report.searchAds.data.primary?.monthlyTotalQueries?.display, "1,200");
  assert.deepEqual(
    report.searchAds.data.relatedKeywords.map((row) => row.keyword),
    ["네이버 광고 비용"],
  );
});

test("자격증명 preflight 실패는 executor와 영속 budget을 전혀 호출하지 않는다", async () => {
  const calls = { searchAdsExecutor: 0, apiHubExecutor: 0, provider: 0 };
  const base = providers();
  const service = createNaverKeywordService({
    store: new MemoryStore(),
    providers: {
      hasSearchAdsCredentials: () => false,
      hasApiHubCredentials: () => false,
      fetchSearchAds: async (seeds) => {
        calls.provider += 1;
        return base.fetchSearchAds(seeds);
      },
      fetchTrend: async (keyword) => {
        calls.provider += 1;
        return base.fetchTrend(keyword);
      },
      fetchBlog: async (keyword) => {
        calls.provider += 1;
        return base.fetchBlog(keyword);
      },
    },
    executor: {
      searchAds: async <T>(task: () => Promise<T>) => {
        calls.searchAdsExecutor += 1;
        return task();
      },
      apiHub: async <T>(task: () => Promise<T>) => {
        calls.apiHubExecutor += 1;
        return task();
      },
    },
    now: () => now,
  });

  const report = await service.overview("자격증명 없음");
  assert.equal(report.searchAds.status, "unavailable");
  assert.equal(report.trend.status, "unavailable");
  assert.equal(report.blog.status, "unavailable");
  assert.deepEqual(calls, { searchAdsExecutor: 0, apiHubExecutor: 0, provider: 0 });
});
