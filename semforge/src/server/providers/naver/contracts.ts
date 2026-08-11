// @TASK P3-C2-T1 - Public NAVER provider contract
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/providers/naver/production.contract.test.ts
import type { NaverQueryCount } from "@/server/naver-search-ads/client";

export type NaverTrendTimeUnit = "date" | "week" | "month";
export type NaverGender = "m" | "f";
export type NaverAgeCode =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11";

export interface NaverCollectionRange {
  readonly startDate: string;
  readonly endDate: string;
  readonly timeUnit: NaverTrendTimeUnit;
}

export interface NaverTrendPoint {
  readonly period: string;
  readonly ratio: number;
}

export interface NaverMonthlySearchVolume {
  readonly pc: NaverQueryCount | null;
  readonly mobile: NaverQueryCount | null;
  readonly source: "naver-search-ads-relkwdstat";
  readonly collectedAt: string;
}

export interface NaverRelativeTrend {
  readonly points: readonly NaverTrendPoint[];
  readonly source: "naver-datalab-search";
  readonly collectedAt: string;
}

export interface NaverGenderTrendSegment {
  readonly gender: NaverGender;
  readonly points: readonly NaverTrendPoint[];
}

export interface NaverGenderDemographics {
  readonly segments: readonly NaverGenderTrendSegment[];
  readonly source: "naver-datalab-search";
  readonly collectedAt: string;
}

export interface NaverAgeTrendSegment {
  readonly age: NaverAgeCode;
  readonly points: readonly NaverTrendPoint[];
}

export interface NaverAgeDemographics {
  readonly segments: readonly NaverAgeTrendSegment[];
  readonly source: "naver-datalab-search";
  readonly collectedAt: string;
}

export interface NaverBlogResultTotal {
  readonly total: number;
  readonly source: "naver-search-blog";
  readonly collectedAt: string;
}

export interface NaverQueryInput {
  readonly query: string;
}

export interface NaverTrendInput extends NaverQueryInput {
  readonly range: NaverCollectionRange;
}

/**
 * 대행사 리포트에 허용된 NAVER 데이터만 노출하는 경계다.
 * 광고 경쟁도/클릭 지표와 NAVER 검색 순위는 이 인터페이스에 존재하지 않는다.
 */
export interface NaverProvider {
  getMonthlySearchVolume(input: NaverQueryInput): Promise<NaverMonthlySearchVolume>;
  getRelativeTrend(input: NaverTrendInput): Promise<NaverRelativeTrend>;
  getGenderDemographics(input: NaverTrendInput): Promise<NaverGenderDemographics>;
  getAgeDemographics(input: NaverTrendInput): Promise<NaverAgeDemographics>;
  getBlogResultTotal(input: NaverQueryInput): Promise<NaverBlogResultTotal>;
}
