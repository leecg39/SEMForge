import assert from "node:assert/strict";
import { test } from "node:test";
import { NaverSearchAdsRateLimitError } from "@/server/naver-search-ads/client";
import {
  NaverProviderExecutionController,
  type ProviderBudgetRepository,
} from "@/server/naver-keywords/execution";
import { NaverProviderCapacityError } from "@/server/naver-keywords/errors";

class MemoryBudget implements ProviderBudgetRepository {
  calls: string[] = [];
  allow = true;

  async reserve(provider: "naver-search-ads" | "naver-api-hub") {
    this.calls.push(provider);
    return this.allow;
  }
}

test("Search Ads 실행은 동시에 하나만 공급자를 호출한다", async () => {
  const budget = new MemoryBudget();
  const controller = new NaverProviderExecutionController(budget);
  let active = 0;
  let maximum = 0;
  const task = async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return "ok";
  };

  await Promise.all([
    controller.searchAds(task, new Date("2026-08-04T00:00:00Z")),
    controller.searchAds(task, new Date("2026-08-04T00:00:01Z")),
    controller.searchAds(task, new Date("2026-08-04T00:00:02Z")),
  ]);

  assert.equal(maximum, 1);
  assert.equal(budget.calls.length, 3);
});

test("Search Ads 429는 재시도하지 않고 15분 회로를 열며 반복 시 30분으로 늘린다", async () => {
  const budget = new MemoryBudget();
  const controller = new NaverProviderExecutionController(budget);
  let providerCalls = 0;
  const limited = async () => {
    providerCalls += 1;
    throw new NaverSearchAdsRateLimitError();
  };

  await assert.rejects(
    () => controller.searchAds(limited, new Date("2026-08-04T00:00:00Z")),
    NaverSearchAdsRateLimitError,
  );
  await assert.rejects(
    () => controller.searchAds(limited, new Date("2026-08-04T00:14:59Z")),
    NaverProviderCapacityError,
  );
  assert.equal(providerCalls, 1);

  await assert.rejects(
    () => controller.searchAds(limited, new Date("2026-08-04T00:15:01Z")),
    NaverSearchAdsRateLimitError,
  );
  await assert.rejects(
    () => controller.searchAds(limited, new Date("2026-08-04T00:44:59Z")),
    NaverProviderCapacityError,
  );
  assert.equal(providerCalls, 2);
});

test("영속 일일 예산이 소진되면 공급자를 호출하지 않는다", async () => {
  const budget = new MemoryBudget();
  budget.allow = false;
  const controller = new NaverProviderExecutionController(budget);
  let called = false;

  await assert.rejects(
    () => controller.apiHub(async () => {
      called = true;
      return "unexpected";
    }, new Date("2026-08-04T00:00:00Z")),
    NaverProviderCapacityError,
  );
  assert.equal(called, false);
});
