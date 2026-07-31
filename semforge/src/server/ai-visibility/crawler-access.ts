/**
 * robots.txt 원문만으로 주요 AI 크롤러의 접근 가능 여부를 판정한다.
 * 네트워크나 저장소에 의존하지 않아 수집 단계와 분리해서 사용할 수 있다.
 */

export type AiCrawlerVendor =
  | "OpenAI"
  | "Anthropic"
  | "Google"
  | "Perplexity"
  | "기타";

export interface AiCrawlerMeta {
  /** robots.txt의 User-agent에 사용하는 제품 토큰 */
  readonly token: string;
  /** 크롤러 운영 주체 */
  readonly vendor: AiCrawlerVendor;
}

/** Phase 0에서 판정하는 AI 크롤러 목록. */
export const AI_CRAWLER_TOKENS = Object.freeze([
  Object.freeze({ token: "GPTBot", vendor: "OpenAI" }),
  Object.freeze({ token: "OAI-SearchBot", vendor: "OpenAI" }),
  Object.freeze({ token: "ChatGPT-User", vendor: "OpenAI" }),
  Object.freeze({ token: "ClaudeBot", vendor: "Anthropic" }),
  Object.freeze({ token: "Claude-User", vendor: "Anthropic" }),
  Object.freeze({ token: "Claude-SearchBot", vendor: "Anthropic" }),
  Object.freeze({ token: "Google-Extended", vendor: "Google" }),
  Object.freeze({ token: "PerplexityBot", vendor: "Perplexity" }),
  Object.freeze({ token: "Perplexity-User", vendor: "Perplexity" }),
  Object.freeze({ token: "CCBot", vendor: "기타" }),
  Object.freeze({ token: "Bytespider", vendor: "기타" }),
  Object.freeze({ token: "Applebot-Extended", vendor: "기타" }),
  Object.freeze({ token: "meta-externalagent", vendor: "기타" }),
  Object.freeze({ token: "Amazonbot", vendor: "기타" }),
] satisfies readonly AiCrawlerMeta[]);

export type RobotsDirective = "allow" | "disallow";

export interface RobotsRule {
  readonly directive: RobotsDirective;
  readonly pattern: string;
}

export interface RobotsGroup {
  readonly userAgents: readonly string[];
  readonly rules: readonly RobotsRule[];
}

export type CrawlerRuleSource = "explicit" | "wildcard" | "default";

export interface AiCrawlerAccessResult extends AiCrawlerMeta {
  readonly allowed: boolean;
  readonly matchedRule: RobotsRule | null;
  readonly source: CrawlerRuleSource;
}

export interface AiCrawlerAccessSummary {
  readonly totalCount: number;
  readonly allowedCount: number;
  readonly blockedCount: number;
  /** 모든 판정 대상이 루트 경로에서 차단됐는지 나타낸다. */
  readonly fullyBlocked: boolean;
}

export type RobotsStatus = "present" | "empty" | "not-found";

export interface AiCrawlerAccessAssessment {
  readonly robotsStatus: RobotsStatus;
  /** 판정 상태와 기본 허용 처리의 근거 */
  readonly reason: string;
  readonly crawlers: readonly AiCrawlerAccessResult[];
  readonly summary: AiCrawlerAccessSummary;
}

interface MutableRobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
}

interface RuleResolution {
  readonly allowed: boolean;
  readonly matchedRule: RobotsRule | null;
  readonly source: CrawlerRuleSource;
}

interface RobotsDocumentState {
  readonly status: RobotsStatus;
  readonly reason: string;
}

const FIELD_PATTERN = /^([^:]+):\s*(.*)$/;
const ROBOTS_DIRECTIVE_PATTERN = /^\s*(?:user-agent|allow|disallow|sitemap|crawl-delay)\s*:/im;
const REGEXP_SPECIAL_PATTERN = /[\\^$+?.()|[\]{}]/g;

/** robots.txt를 연속된 User-agent 선언 기준의 그룹 구조로 파싱한다. */
export function parseRobotsGroups(robotsTxt: string): readonly RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: MutableRobotsGroup | null = null;
  let acceptsAnotherAgent = false;

  const finishCurrentGroup = (): void => {
    if (current === null || current.userAgents.length === 0) return;

    groups.push({
      userAgents: [...current.userAgents],
      rules: current.rules.map((rule) => ({ ...rule })),
    });
    current = null;
    acceptsAnotherAgent = false;
  };

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line.length === 0) {
      finishCurrentGroup();
      continue;
    }

    const fieldMatch = FIELD_PATTERN.exec(line);
    if (fieldMatch === null) {
      acceptsAnotherAgent = false;
      continue;
    }

    const field = fieldMatch[1]?.trim().toLowerCase() ?? "";
    const value = fieldMatch[2]?.trim() ?? "";

    if (field === "user-agent") {
      if (value.length === 0) {
        acceptsAnotherAgent = false;
        continue;
      }
      if (current !== null && !acceptsAnotherAgent) finishCurrentGroup();
      if (current === null) current = { userAgents: [], rules: [] };
      current.userAgents.push(value);
      acceptsAnotherAgent = true;
      continue;
    }

    if (field === "allow" || field === "disallow") {
      if (current !== null) {
        current.rules.push({ directive: field, pattern: value });
        acceptsAnotherAgent = false;
      }
      continue;
    }

    if (current !== null) acceptsAnotherAgent = false;
  }

  finishCurrentGroup();
  return groups;
}

/** 특정 User-agent가 robots.txt의 path에 접근할 수 있는지 판정한다. */
export function isPathAllowed(robotsTxt: string, userAgent: string, path: string): boolean {
  const groups = parseRobotsGroups(robotsTxt);
  return resolvePathAccess(groups, userAgent, path).allowed;
}

/** 주요 AI 크롤러가 사이트 루트에 접근할 수 있는지 일괄 판정한다. */
export function assessAiCrawlerAccess(robotsTxt: string): AiCrawlerAccessAssessment {
  const documentState = classifyRobotsDocument(robotsTxt);
  const groups = documentState.status === "present" ? parseRobotsGroups(robotsTxt) : [];
  const crawlers = AI_CRAWLER_TOKENS.map(({ token, vendor }) => {
    const resolution = resolvePathAccess(groups, token, "/");
    return {
      token,
      vendor,
      allowed: resolution.allowed,
      matchedRule: resolution.matchedRule,
      source: resolution.source,
    } satisfies AiCrawlerAccessResult;
  });
  const blockedCount = crawlers.filter(({ allowed }) => !allowed).length;
  const totalCount = crawlers.length;

  return {
    robotsStatus: documentState.status,
    reason: documentState.reason,
    crawlers,
    summary: {
      totalCount,
      allowedCount: totalCount - blockedCount,
      blockedCount,
      fullyBlocked: totalCount > 0 && blockedCount === totalCount,
    },
  };
}

function resolvePathAccess(
  groups: readonly RobotsGroup[],
  userAgent: string,
  path: string,
): RuleResolution {
  const normalizedAgent = userAgent.trim().toLowerCase();
  const explicitGroups = groups.filter((group) =>
    group.userAgents.some((agent) => agent.toLowerCase() === normalizedAgent),
  );
  const wildcardGroups = groups.filter((group) =>
    group.userAgents.some((agent) => agent === "*"),
  );
  const source: CrawlerRuleSource =
    explicitGroups.length > 0 ? "explicit" : wildcardGroups.length > 0 ? "wildcard" : "default";
  const applicableGroups =
    source === "explicit" ? explicitGroups : source === "wildcard" ? wildcardGroups : [];

  let bestRule: RobotsRule | null = null;
  let bestSpecificity = -1;

  for (const group of applicableGroups) {
    for (const rule of group.rules) {
      if (rule.pattern.length === 0 || !matchesRulePattern(rule.pattern, path)) continue;

      const specificity = getRuleSpecificity(rule.pattern);
      const winsTie =
        specificity === bestSpecificity &&
        rule.directive === "allow" &&
        bestRule?.directive === "disallow";
      if (specificity > bestSpecificity || winsTie) {
        bestRule = rule;
        bestSpecificity = specificity;
      }
    }
  }

  return {
    allowed: bestRule?.directive !== "disallow",
    matchedRule: bestRule === null ? null : { ...bestRule },
    source,
  };
}

function matchesRulePattern(pattern: string, path: string): boolean {
  const endsAtPathBoundary = pattern.endsWith("$");
  const pathPattern = endsAtPathBoundary ? pattern.slice(0, -1) : pattern;
  const expression = pathPattern
    .split("*")
    .map((part) => part.replace(REGEXP_SPECIAL_PATTERN, "\\$&"))
    .join(".*");
  const matcher = new RegExp(`^${expression}${endsAtPathBoundary ? "$" : ""}`);
  return matcher.test(path);
}

function getRuleSpecificity(pattern: string): number {
  const withoutEndMarker = pattern.endsWith("$") ? pattern.slice(0, -1) : pattern;
  return withoutEndMarker.replaceAll("*", "").length;
}

function classifyRobotsDocument(robotsTxt: string): RobotsDocumentState {
  const contentWithoutComments = robotsTxt
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line.length > 0)
    .join("\n");

  if (contentWithoutComments.length === 0) {
    return {
      status: "empty",
      reason: "robots.txt가 비어 있어 모든 AI 크롤러를 기본 허용합니다.",
    };
  }

  const hasRobotsDirective = ROBOTS_DIRECTIVE_PATTERN.test(robotsTxt);
  const normalizedContent = contentWithoutComments.toLowerCase();
  const looksLikeNotFound =
    !hasRobotsDirective &&
    (normalizedContent === "404" ||
      /\b404\b/.test(normalizedContent) ||
      /\b(?:page\s+)?not[\s_-]*found\b/.test(normalizedContent));

  if (looksLikeNotFound) {
    return {
      status: "not-found",
      reason: "404 본문으로 확인되어 robots.txt가 없는 것으로 보고 모든 AI 크롤러를 허용합니다.",
    };
  }

  return {
    status: "present",
    reason: "robots.txt의 루트 경로 규칙을 AI 크롤러별로 판정했습니다.",
  };
}
