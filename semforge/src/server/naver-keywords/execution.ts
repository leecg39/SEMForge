// @TASK NAVER-KI-SVC-02 - 공급자 예산·직렬화·429 회로 차단
// @SPEC user-approved-plan#3-b-data-model-and-provenance
// @TEST src/server/naver-keywords/execution.test.ts
import { NaverSearchAdsRateLimitError } from "@/server/naver-search-ads/client";
import { NaverProviderCapacityError } from "@/server/naver-keywords/errors";

export type NaverBudgetProvider = "naver-search-ads" | "naver-api-hub";

export interface ProviderBudgetRepository {
  reserve(provider: NaverBudgetProvider, now: Date): Promise<boolean>;
}

const INITIAL_SEARCH_ADS_BACKOFF_MS = 15 * 60 * 1_000;
const MAX_SEARCH_ADS_BACKOFF_MS = 2 * 60 * 60 * 1_000;

export class NaverProviderExecutionController {
  private searchAdsTail: Promise<void> = Promise.resolve();
  private searchAdsBlockedUntil = 0;
  private searchAdsBackoffMs = INITIAL_SEARCH_ADS_BACKOFF_MS;

  constructor(private readonly budgets: ProviderBudgetRepository) {}

  async searchAds<T>(task: () => Promise<T>, now: Date): Promise<T> {
    const execute = async () => {
      if (now.getTime() < this.searchAdsBlockedUntil) {
        const seconds = Math.max(1, Math.ceil((this.searchAdsBlockedUntil - now.getTime()) / 1_000));
        throw new NaverProviderCapacityError(
          `NAVER Search Ads 호출이 일시 중지되었습니다. ${seconds}초 후 다시 시도해 주세요.`,
        );
      }
      if (!(await this.budgets.reserve("naver-search-ads", now))) {
        throw new NaverProviderCapacityError("NAVER Search Ads 일일 안전 한도에 도달했습니다.");
      }
      try {
        const result = await task();
        this.searchAdsBlockedUntil = 0;
        this.searchAdsBackoffMs = INITIAL_SEARCH_ADS_BACKOFF_MS;
        return result;
      } catch (error) {
        if (error instanceof NaverSearchAdsRateLimitError) {
          this.searchAdsBlockedUntil = now.getTime() + this.searchAdsBackoffMs;
          this.searchAdsBackoffMs = Math.min(
            this.searchAdsBackoffMs * 2,
            MAX_SEARCH_ADS_BACKOFF_MS,
          );
        }
        throw error;
      }
    };

    const result = this.searchAdsTail.then(execute, execute);
    this.searchAdsTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async apiHub<T>(task: () => Promise<T>, now: Date): Promise<T> {
    if (!(await this.budgets.reserve("naver-api-hub", now))) {
      throw new NaverProviderCapacityError("NAVER API HUB 일일 안전 한도에 도달했습니다.");
    }
    return task();
  }
}
