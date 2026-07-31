import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_CRAWLER_TOKENS,
  assessAiCrawlerAccess,
  isPathAllowed,
  parseRobotsGroups,
} from "@/server/ai-visibility/crawler-access";

test("필수 AI 크롤러 토큰과 소속 메타를 모두 제공한다", () => {
  const tokens = AI_CRAWLER_TOKENS.map(({ token }) => token);

  assert.deepEqual(tokens, [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-User",
    "Claude-SearchBot",
    "Google-Extended",
    "PerplexityBot",
    "Perplexity-User",
    "CCBot",
    "Bytespider",
    "Applebot-Extended",
    "meta-externalagent",
    "Amazonbot",
  ]);
  assert.equal(AI_CRAWLER_TOKENS.find(({ token }) => token === "GPTBot")?.vendor, "OpenAI");
  assert.equal(
    AI_CRAWLER_TOKENS.find(({ token }) => token === "Claude-SearchBot")?.vendor,
    "Anthropic",
  );
});

test("연속된 User-agent 선언을 하나의 그룹으로 파싱한다", () => {
  const groups = parseRobotsGroups(`
User-agent: GPTBot
User-Agent: OAI-SearchBot
Disallow: /private # 내부 문서는 제외
Allow: /private/public

User-agent: *
Disallow:
`);

  assert.deepEqual(groups, [
    {
      userAgents: ["GPTBot", "OAI-SearchBot"],
      rules: [
        { directive: "disallow", pattern: "/private" },
        { directive: "allow", pattern: "/private/public" },
      ],
    },
    {
      userAgents: ["*"],
      rules: [{ directive: "disallow", pattern: "" }],
    },
  ]);
});

test("Disallow 전면 차단과 빈 Disallow를 구분한다", () => {
  assert.equal(isPathAllowed("User-agent: *\nDisallow: /", "GPTBot", "/"), false);
  assert.equal(isPathAllowed("User-agent: *\nDisallow:", "GPTBot", "/"), true);
});

test("더 긴 Allow 규칙이 Disallow보다 우선하고 같은 길이에서도 Allow가 이긴다", () => {
  const robotsTxt = `
User-agent: GPTBot
Disallow: /private
Allow: /private/public
Disallow: /same
Allow: /same
`;

  assert.equal(isPathAllowed(robotsTxt, "GPTBot", "/private/report"), false);
  assert.equal(isPathAllowed(robotsTxt, "GPTBot", "/private/public/report"), true);
  assert.equal(isPathAllowed(robotsTxt, "GPTBot", "/same"), true);
});

test("규칙 경로의 와일드카드를 해석한다", () => {
  const robotsTxt = `
User-agent: GPTBot
Disallow: /archive/*/draft
Allow: /archive/public/*
`;

  assert.equal(isPathAllowed(robotsTxt, "GPTBot", "/archive/2026/draft"), false);
  assert.equal(isPathAllowed(robotsTxt, "GPTBot", "/archive/public/article"), true);
  assert.equal(isPathAllowed(robotsTxt, "GPTBot", "/news/draft"), true);
});

test("$ 종결자는 경로 끝에서만 규칙을 일치시킨다", () => {
  const robotsTxt = "User-agent: GPTBot\nDisallow: /draft$";

  assert.equal(isPathAllowed(robotsTxt, "GPTBot", "/draft"), false);
  assert.equal(isPathAllowed(robotsTxt, "GPTBot", "/draft/child"), true);
});

test("명시 그룹이 있으면 우선하고 없을 때만 User-agent:* 그룹으로 폴백한다", () => {
  const robotsTxt = `
User-agent: GPTBot
Allow: /

User-agent: *
Disallow: /
`;

  assert.equal(isPathAllowed(robotsTxt, "GPTBot", "/"), true);
  assert.equal(isPathAllowed(robotsTxt, "ClaudeBot", "/"), false);

  const assessment = assessAiCrawlerAccess(robotsTxt);
  assert.equal(assessment.crawlers.find(({ token }) => token === "GPTBot")?.source, "explicit");
  assert.equal(
    assessment.crawlers.find(({ token }) => token === "ClaudeBot")?.source,
    "wildcard",
  );
});

test("특정 봇 그룹만 차단하고 나머지는 기본 허용한다", () => {
  const assessment = assessAiCrawlerAccess("User-agent: GPTBot\nDisallow: /");
  const gptBot = assessment.crawlers.find(({ token }) => token === "GPTBot");
  const claudeBot = assessment.crawlers.find(({ token }) => token === "ClaudeBot");

  assert.deepEqual(gptBot, {
    token: "GPTBot",
    vendor: "OpenAI",
    allowed: false,
    matchedRule: { directive: "disallow", pattern: "/" },
    source: "explicit",
  });
  assert.equal(claudeBot?.allowed, true);
  assert.equal(claudeBot?.matchedRule, null);
  assert.equal(claudeBot?.source, "default");
  assert.equal(assessment.summary.blockedCount, 1);
  assert.equal(assessment.summary.fullyBlocked, false);
});

test("주석과 User-agent 이름의 대소문자를 무시한다", () => {
  const robotsTxt = `
# AI 봇 정책
uSeR-aGeNt: gpTbOt # OpenAI
dIsAlLoW: /Secret # 비공개
`;

  assert.equal(isPathAllowed(robotsTxt, "GPTBOT", "/Secret/document"), false);
  assert.equal(isPathAllowed(robotsTxt, "gptbot", "/public"), true);
});

test("빈 robots.txt는 모든 봇을 허용하고 근거를 반환한다", () => {
  const assessment = assessAiCrawlerAccess("  \n# 주석만 있음\n");

  assert.equal(assessment.robotsStatus, "empty");
  assert.match(assessment.reason, /비어/);
  assert.equal(assessment.summary.blockedCount, 0);
  assert.equal(assessment.summary.fullyBlocked, false);
  assert.equal(assessment.crawlers.every(({ allowed }) => allowed), true);
  assert.equal(assessment.crawlers.every(({ source }) => source === "default"), true);
});

test("일반적인 404 본문은 robots.txt 부재로 보고 모든 봇을 허용한다", () => {
  const assessment = assessAiCrawlerAccess(`<!doctype html>
<html><head><title>404 Not Found</title></head><body>Page not found</body></html>`);

  assert.equal(assessment.robotsStatus, "not-found");
  assert.match(assessment.reason, /404/);
  assert.equal(assessment.summary.allowedCount, AI_CRAWLER_TOKENS.length);
  assert.equal(assessment.crawlers.every(({ matchedRule }) => matchedRule === null), true);
});

test("User-agent:* 전면 차단은 모든 대상 봇의 차단으로 요약한다", () => {
  const assessment = assessAiCrawlerAccess("User-agent: *\nDisallow: /");

  assert.equal(assessment.summary.totalCount, AI_CRAWLER_TOKENS.length);
  assert.equal(assessment.summary.allowedCount, 0);
  assert.equal(assessment.summary.blockedCount, AI_CRAWLER_TOKENS.length);
  assert.equal(assessment.summary.fullyBlocked, true);
  assert.equal(assessment.crawlers.every(({ source }) => source === "wildcard"), true);
});
