import {
  AI_ANSWER_PLATFORMS,
  type AiAnswerPlatform,
} from "@/db/schema/ai-visibility";

export type PlatformConnectionStatus = "live" | "unavailable";
export type PlatformDataStatus = "observed" | "empty" | "unavailable";

export interface PlatformObservationCounts {
  /** 수집된 전체 답변 수. brandMentioned=null인 건도 포함한다. */
  observed: number;
  /** brandMentioned=true인 답변 수. */
  mentioned: number;
  /** brandMentioned=null이라 언급 여부를 판정할 수 없는 답변 수. */
  unknownMentionCount: number;
}

export interface BuildPlatformBreakdownInput {
  credentials: Record<AiAnswerPlatform, boolean>;
  observations: Partial<Record<AiAnswerPlatform, PlatformObservationCounts>>;
}

export interface PlatformBreakdownItem {
  platform: AiAnswerPlatform;
  /** 제공사 연결 상태. 관측 유무는 dataStatus로 별도 표현한다. */
  status: PlatformConnectionStatus;
  dataStatus: PlatformDataStatus;
  observed: number | null;
  mentioned: number | null;
  unknownMentionCount: number | null;
  /** 판정 가능한 관측 중 언급된 비율(0~100). */
  mentionRate: number | null;
  reason?: string;
}

export interface PlatformBreakdownSummary {
  totalObserved: number;
  /** 실제 관측이 한 건 이상인 플랫폼 수. */
  dataPlatformCount: number;
  unavailablePlatformCount: number;
}

export interface PlatformBreakdown {
  platforms: PlatformBreakdownItem[];
  summary: PlatformBreakdownSummary;
}

const PLATFORM_LABELS: Record<AiAnswerPlatform, string> = {
  google_aio: "Google AI 개요",
  google_ai_mode: "Google AI Mode",
  grok: "Grok",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

const EMPTY_COUNTS: PlatformObservationCounts = {
  observed: 0,
  mentioned: 0,
  unknownMentionCount: 0,
};

function assertValidCounts(
  platform: AiAnswerPlatform,
  counts: PlatformObservationCounts,
): void {
  for (const [name, value] of Object.entries(counts)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${platform}.${name}은 0 이상의 안전한 정수여야 합니다.`);
    }
  }

  const judgeable = counts.observed - counts.unknownMentionCount;
  if (judgeable < 0) {
    throw new RangeError(
      `${platform}.unknownMentionCount는 observed보다 클 수 없습니다.`,
    );
  }
  if (counts.mentioned > judgeable) {
    throw new RangeError(
      `${platform}.mentioned는 판정 가능한 관측 수보다 클 수 없습니다.`,
    );
  }
}

/**
 * 외부 호출이나 현재 시각에 의존하지 않고 플랫폼별 실측 현황을 집계한다.
 * 미연동 플랫폼의 전달된 관측값은 신뢰하지 않고 모두 null로 숨긴다.
 */
export function buildPlatformBreakdown(
  input: BuildPlatformBreakdownInput,
): PlatformBreakdown {
  const platforms = AI_ANSWER_PLATFORMS.map((platform): PlatformBreakdownItem => {
    if (!input.credentials[platform]) {
      return {
        platform,
        status: "unavailable",
        dataStatus: "unavailable",
        observed: null,
        mentioned: null,
        unknownMentionCount: null,
        mentionRate: null,
        reason: `${PLATFORM_LABELS[platform]} 자격증명이 설정되지 않아 데이터를 수집할 수 없습니다.`,
      };
    }

    const counts = input.observations[platform] ?? EMPTY_COUNTS;
    assertValidCounts(platform, counts);

    if (counts.observed === 0) {
      return {
        platform,
        status: "live",
        dataStatus: "empty",
        observed: 0,
        mentioned: 0,
        unknownMentionCount: 0,
        mentionRate: null,
        reason: "자격증명은 설정되어 있으나 아직 관측 데이터가 없습니다.",
      };
    }

    const judgeable = counts.observed - counts.unknownMentionCount;
    return {
      platform,
      status: "live",
      dataStatus: "observed",
      observed: counts.observed,
      mentioned: counts.mentioned,
      unknownMentionCount: counts.unknownMentionCount,
      mentionRate: judgeable === 0 ? null : (counts.mentioned / judgeable) * 100,
      ...(judgeable === 0
        ? { reason: "모든 관측의 브랜드 언급 여부를 판정할 수 없습니다." }
        : {}),
    };
  });

  return {
    platforms,
    summary: {
      totalObserved: platforms.reduce(
        (sum, row) => sum + (row.observed ?? 0),
        0,
      ),
      dataPlatformCount: platforms.filter(
        (row) => row.dataStatus === "observed",
      ).length,
      unavailablePlatformCount: platforms.filter(
        (row) => row.status === "unavailable",
      ).length,
    },
  };
}
