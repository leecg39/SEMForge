import { spawn } from "node:child_process";
import {
  buildCollectionPrompt,
  detectBrandMention,
  parseProviderOutput,
} from "@/server/ai-visibility/providers/parse";
import type {
  AiAnswerDraft,
  AiAnswerProvider,
  AiAnswerRequest,
} from "@/server/ai-visibility/providers/types";
import { providerError, providerLive, type ProviderResult } from "@/server/providers/types";

/**
 * 계정 인증 경로의 Grok 수집기.
 *
 * xAI API 크레딧 대신 로컬 cursor-agent CLI 의 로그인 세션을 쓴다. 크레딧이 충전되면
 * AI_ANSWER_PROVIDER=xai 로 바꾸는 것만으로 HTTP 경로로 전환된다.
 *
 * 한계: cursor-agent 가 설치·로그인된 로컬 환경에서만 동작한다(deployable=false).
 * 그리고 xAI 크레딧은 안 쓰지만 Cursor 구독 쿼터를 소모하므로 실과금으로 취급한다.
 */

const SOURCE = "cursor-grok";
const DEFAULT_MODEL = "cursor-grok-4.5-high";
const DEFAULT_TIMEOUT_MS = 240_000;

export interface CursorRunnerResult {
  ok: boolean;
  stdout: string;
  error?: string;
}

export type CursorRunner = (prompt: string, model: string) => Promise<CursorRunnerResult>;

/** cursor-agent 를 비대화 모드로 실행한다. stdin 을 닫지 않으면 입력을 기다리며 멈춘다. */
function spawnCursorAgent(prompt: string, model: string): Promise<CursorRunnerResult> {
  return new Promise((resolve) => {
    const home = process.env.HOME ?? "";
    const child = spawn("cursor-agent", ["-p", "--mode", "ask", "--model", model, prompt], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: `${home}/.local/bin:${process.env.PATH ?? ""}` },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: "", error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, stdout });
        return;
      }
      resolve({ ok: false, stdout, error: stderr.trim() || `종료 코드 ${code ?? "없음"}` });
    });
  });
}

export interface CursorGrokOptions {
  runner?: CursorRunner;
  model?: string;
}

export function createCursorGrokProvider(options?: CursorGrokOptions): AiAnswerProvider {
  const runner = options?.runner ?? spawnCursorAgent;
  const model = options?.model ?? DEFAULT_MODEL;

  return {
    id: SOURCE,
    platform: "grok",
    source: SOURCE,
    // 로컬 CLI 로그인 세션에 의존하므로 배포 환경에서는 동작하지 않는다.
    deployable: false,

    async collect(request: AiAnswerRequest): Promise<ProviderResult<AiAnswerDraft>> {
      const result = await runner(buildCollectionPrompt(request), model);
      if (!result.ok) {
        return providerError<AiAnswerDraft>(
          SOURCE,
          `Grok 계정 인증 경로 실행에 실패했습니다: ${result.error ?? "알 수 없는 오류"}`,
        );
      }

      const parsed = parseProviderOutput(result.stdout);
      if (parsed.answerText.length === 0) {
        return providerError<AiAnswerDraft>(SOURCE, "모델이 빈 응답을 반환했습니다.");
      }

      const mention = detectBrandMention({
        domain: request.domain,
        answerText: parsed.answerText,
        mentionedBrands: parsed.mentionedBrands,
        citedDomains: parsed.citedDomains,
        structured: parsed.structured,
      });

      return providerLive<AiAnswerDraft>(SOURCE, {
        platform: "grok",
        model,
        answerText: parsed.answerText,
        mentionedBrands: parsed.mentionedBrands,
        citedDomains: parsed.citedDomains,
        structured: parsed.structured,
        brandMentioned: mention.brandMentioned,
        brandRank: mention.brandRank,
        billed: true,
        source: SOURCE,
      });
    },
  };
}
