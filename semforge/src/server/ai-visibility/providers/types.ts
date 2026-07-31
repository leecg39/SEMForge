import type { AiAnswerPlatform } from "@/db/schema/ai-visibility";
import type { ProviderResult } from "@/server/providers/types";

/**
 * AI 답변 수집 제공자의 공통 계약.
 *
 * 계정 인증 경로(cursor-grok)와 크레딧 경로(xai)가 같은 인터페이스를 구현하므로
 * 전환은 env 값 하나만 바꾸면 된다.
 */

export interface AiAnswerRequest {
  /** 사용자에게 물을 자연어 프롬프트. 대상 도메인은 여기에 넣지 않는다. */
  prompt: string;
  /** 언급 여부를 판정할 대상 도메인. 프롬프트가 아니라 판정에만 쓴다. */
  domain: string;
  locale?: string;
}

export interface AiAnswerDraft {
  platform: AiAnswerPlatform;
  model: string;
  answerText: string;
  mentionedBrands: string[];
  citedDomains: string[];
  /** 기대한 JSON 구조를 얻었는가. false 면 언급 판정을 신뢰할 수 없다. */
  structured: boolean;
  /** 판정 불가면 null. 임의로 false 로 확정하지 않는다. */
  brandMentioned: boolean | null;
  brandRank: number | null;
  /** 실제 모델 호출이 발생했는가. 비용 추적용. */
  billed: boolean;
  source: string;
}

export interface AiAnswerProvider {
  readonly id: string;
  readonly platform: AiAnswerPlatform;
  readonly source: string;
  /** 배포 환경에서도 동작하는가. 로컬 CLI 에 의존하는 경로는 false. */
  readonly deployable: boolean;
  collect(request: AiAnswerRequest): Promise<ProviderResult<AiAnswerDraft>>;
}
