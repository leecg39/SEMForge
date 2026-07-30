/**
 * robots.txt 의 AI 크롤러 규칙 판정.
 *
 * Semrush 사이트 진단의 "AI 검색 상태" 카드에 대응한다.
 * 크롤 시점에 대상 사이트의 robots.txt 를 가져와 주요 AI 봇(GPTBot, ClaudeBot,
 * PerplexityBot …)이 루트 경로("/")를 크롤할 수 있는지 규칙 단위로 평가한다.
 *
 * 판정 규칙 (robots.txt RFC 9309 단순화):
 *   - 봇 토큰과 정확히 일치하는 User-agent 그룹이 있으면 그 그룹의 규칙을 쓰고,
 *     없으면 "*" 그룹 규칙으로 폴백한다.
 *   - 매칭 경로("/")에 적용되는 규칙 중 가장 긴 path 가 이기고,
 *     같은 길이면 Allow 가 Disallow 를 이긴다.
 *   - Disallow 의 path 가 비어 있으면 제한 없음(허용)으로 본다.
 *   - 규칙이 하나도 없으면 허용이다.
 */

export interface AiBotRule {
  /** robots.txt User-agent 토큰 */
  token: string;
  /** UI 표시용 짧은 설명 (한국어) */
  label: string;
  /** 루트 경로 크롤 허용 여부 */
  allowed: boolean;
}

/** 판정 대상 AI 크롤러. 실제 서비스들이 공식 문서로 고지한 토큰만 모았다. */
export const AI_BOT_TOKENS: { token: string; label: string }[] = [
  { token: "GPTBot", label: "OpenAI 학습 크롤러" },
  { token: "OAI-SearchBot", label: "ChatGPT 검색 인덱싱" },
  { token: "ChatGPT-User", label: "ChatGPT 실시간 방문" },
  { token: "ClaudeBot", label: "Anthropic 학습 크롤러" },
  { token: "Claude-User", label: "Claude 실시간 방문" },
  { token: "PerplexityBot", label: "Perplexity 검색 크롤러" },
  { token: "Perplexity-User", label: "Perplexity 실시간 방문" },
  { token: "Google-Extended", label: "Google Gemini 학습" },
  { token: "Applebot-Extended", label: "Apple AI 학습" },
  { token: "meta-externalagent", label: "Meta AI 학습" },
  { token: "Bytespider", label: "ByteDance 크롤러" },
  { token: "CCBot", label: "Common Crawl" },
  { token: "Amazonbot", label: "Amazon AI 크롤러" },
];

interface RobotsGroup {
  agents: string[];
  rules: { type: "allow" | "disallow"; path: string }[];
}

/**
 * robots.txt 본문을 User-agent 그룹 단위로 파싱한다.
 * 그룹 밖 지시문(Sitemap, Crawl-delay 등)은 이 판정에서는 무시한다.
 */
export function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    // 주석 제거. # 자체가 경로에 포함되는 경우는 드물어 단순 처리한다.
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      // 빈 줄은 그룹 경계다. 단, 아직 규칙이 없는 연속 User-agent 블록은 유지한다.
      if (current && current.rules.length > 0) {
        groups.push(current);
        current = null;
        sawAgent = false;
      }
      continue;
    }
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const field = match[1]!.toLowerCase();
    const value = match[2]!.trim();

    if (field === "user-agent") {
      if (!current || current.rules.length > 0 || !sawAgent) {
        if (current) groups.push(current);
        current = { agents: [], rules: [] };
      }
      sawAgent = true;
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if (field === "allow" || field === "disallow") {
      current.rules.push({ type: field, path: value });
    }
  }
  if (current) groups.push(current);
  return groups;
}

/** 특정 봇 토큰이 path 를 크롤할 수 있는지 판정한다. */
export function isBotAllowed(groups: RobotsGroup[], token: string, path = "/"): boolean {
  const lowered = token.toLowerCase();
  const exact = groups.filter((group) => group.agents.includes(lowered));
  const wildcards = groups.filter((group) => group.agents.includes("*"));
  const applicable = exact.length > 0 ? exact : wildcards;

  let bestLength = -1;
  let bestType: "allow" | "disallow" | null = null;
  for (const group of applicable) {
    for (const rule of group.rules) {
      // Disallow: (빈 path) 는 "제한 없음" — 매칭 대상에서 제외한다.
      if (rule.path === "") continue;
      if (!path.startsWith(rule.path)) continue;
      if (
        rule.path.length > bestLength ||
        (rule.path.length === bestLength && rule.type === "allow")
      ) {
        bestLength = rule.path.length;
        bestType = rule.type;
      }
    }
  }
  return bestType !== "disallow";
}

/** robots.txt 본문에서 주요 AI 봇별 크롤 허용 여부를 평가한다. */
export function evaluateAiBots(text: string): AiBotRule[] {
  const groups = parseRobotsTxt(text);
  return AI_BOT_TOKENS.map(({ token, label }) => ({
    token,
    label,
    allowed: isBotAllowed(groups, token),
  }));
}
