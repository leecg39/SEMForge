import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiAnswerPlatform } from "@/db/schema/ai-visibility";
import {
  buildPlatformBreakdown,
  type BuildPlatformBreakdownInput,
} from "@/server/ai-visibility/platform-breakdown";

const ALL_PLATFORMS: AiAnswerPlatform[] = [
  "google_aio",
  "google_ai_mode",
  "grok",
  "chatgpt",
  "gemini",
  "perplexity",
];

function input(
  overrides: Partial<BuildPlatformBreakdownInput> = {},
): BuildPlatformBreakdownInput {
  return {
    credentials: Object.fromEntries(
      ALL_PLATFORMS.map((platform) => [platform, false]),
    ) as Record<AiAnswerPlatform, boolean>,
    observations: {},
    ...overrides,
  };
}

test("자격증명이 없으면 unavailable이며 수치를 노출하지 않는다", () => {
  const result = buildPlatformBreakdown(input());
  const chatgpt = result.platforms.find((row) => row.platform === "chatgpt");

  assert.ok(chatgpt);
  assert.equal(chatgpt.status, "unavailable");
  assert.equal(chatgpt.dataStatus, "unavailable");
  assert.equal(chatgpt.observed, null);
  assert.equal(chatgpt.mentioned, null);
  assert.equal(chatgpt.unknownMentionCount, null);
  assert.equal(chatgpt.mentionRate, null);
  assert.match(chatgpt.reason ?? "", /자격증명/);
});

test("자격증명은 있지만 관측이 0건이면 미연동과 다른 관측 없음 상태다", () => {
  const credentials = input().credentials;
  credentials.grok = true;

  const result = buildPlatformBreakdown(input({ credentials }));
  const grok = result.platforms.find((row) => row.platform === "grok");

  assert.ok(grok);
  assert.equal(grok.status, "live");
  assert.equal(grok.dataStatus, "empty");
  assert.equal(grok.observed, 0);
  assert.equal(grok.mentioned, 0);
  assert.equal(grok.unknownMentionCount, 0);
  assert.equal(grok.mentionRate, null);
  assert.match(grok.reason ?? "", /관측.*없/);
});

test("판정 가능한 관측이 있으면 언급 비율을 백분율로 계산한다", () => {
  const credentials = input().credentials;
  credentials.google_aio = true;

  const result = buildPlatformBreakdown(
    input({
      credentials,
      observations: {
        google_aio: { observed: 8, mentioned: 2, unknownMentionCount: 0 },
      },
    }),
  );
  const aio = result.platforms.find((row) => row.platform === "google_aio");

  assert.ok(aio);
  assert.equal(aio.dataStatus, "observed");
  assert.equal(aio.mentionRate, 25);
  assert.equal(aio.reason, undefined);
});

test("판정 불가 건은 언급 비율의 분모에서 제외하고 건수를 함께 반환한다", () => {
  const credentials = input().credentials;
  credentials.google_aio = true;

  const result = buildPlatformBreakdown(
    input({
      credentials,
      observations: {
        google_aio: { observed: 10, mentioned: 3, unknownMentionCount: 4 },
      },
    }),
  );
  const aio = result.platforms.find((row) => row.platform === "google_aio");

  assert.ok(aio);
  assert.equal(aio.unknownMentionCount, 4);
  assert.equal(aio.mentionRate, 50);
});

test("모든 관측이 판정 불가이면 0으로 나누지 않고 비율을 null로 둔다", () => {
  const credentials = input().credentials;
  credentials.grok = true;

  const result = buildPlatformBreakdown(
    input({
      credentials,
      observations: {
        grok: { observed: 3, mentioned: 0, unknownMentionCount: 3 },
      },
    }),
  );
  const grok = result.platforms.find((row) => row.platform === "grok");

  assert.ok(grok);
  assert.equal(grok.dataStatus, "observed");
  assert.equal(grok.mentionRate, null);
});

test("요약은 전체 관측·실데이터 플랫폼·미연동 플랫폼을 각각 집계한다", () => {
  const credentials = input().credentials;
  credentials.google_aio = true;
  credentials.grok = true;

  const result = buildPlatformBreakdown(
    input({
      credentials,
      observations: {
        google_aio: { observed: 7, mentioned: 2, unknownMentionCount: 1 },
        grok: { observed: 0, mentioned: 0, unknownMentionCount: 0 },
      },
    }),
  );

  assert.deepEqual(result.summary, {
    totalObserved: 7,
    dataPlatformCount: 1,
    unavailablePlatformCount: 4,
  });
});
