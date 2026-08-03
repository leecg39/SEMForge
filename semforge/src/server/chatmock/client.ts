import { ApiError } from "@/lib/api";

const DEFAULT_BASE_URL = "http://127.0.0.1:8000/v1";
const DEFAULT_CONTENT_MODEL = "gpt-5.6-luna";
const DEFAULT_CONTENT_TIMEOUT_MS = 270_000;
const MIN_CONTENT_TIMEOUT_MS = 30_000;
const MAX_CONTENT_TIMEOUT_MS = 300_000;

export type ChatMockContentCapability = {
  enabled: boolean;
  reason: string | null;
  model: string;
};

function baseUrl(): string {
  const configured = process.env.CHATMOCK_BASE_URL?.trim() || DEFAULT_BASE_URL;
  try {
    const url = new URL(configured);
    if (!(["http:", "https:"] as string[]).includes(url.protocol)) throw new Error();
    return url.toString().replace(/\/+$/u, "");
  } catch {
    throw new ApiError("INTERNAL", "CHATMOCK_BASE_URL은 올바른 HTTP(S) 주소여야 합니다.");
  }
}

export function getContentChatMockModel(): string {
  return process.env.CHATMOCK_CONTENT_MODEL?.trim() || DEFAULT_CONTENT_MODEL;
}

function contentRequestTimeoutMs(): number {
  const configured = Number(process.env.CHATMOCK_CONTENT_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_CONTENT_TIMEOUT_MS;
  return Math.min(
    MAX_CONTENT_TIMEOUT_MS,
    Math.max(MIN_CONTENT_TIMEOUT_MS, Math.trunc(configured)),
  );
}

function outputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const texts: string[] = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        texts.push((part as { text: string }).text);
      }
    }
  }
  return texts.join("\n");
}

function parseEventStream(raw: string): Record<string, unknown> | null {
  let completed: Record<string, unknown> | null = null;
  let streamedText = "";
  for (const block of raw.split(/\r?\n\r?\n/u)) {
    const data = block
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as Record<string, unknown>;
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        streamedText += event.delta;
      }
      if (event.type === "response.completed" && event.response && typeof event.response === "object") {
        completed = event.response as Record<string, unknown>;
      }
    } catch {
      // ChatMock의 알 수 없는 중간 이벤트는 최종 응답에 영향을 주지 않는다.
    }
  }
  if (completed && streamedText && typeof completed.output_text !== "string") {
    return { ...completed, output_text: streamedText };
  }
  return completed ?? (streamedText ? { output_text: streamedText } : null);
}

async function readPayload(response: Response): Promise<Record<string, unknown> | null> {
  const raw = await response.text();
  if (response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
    return parseEventStream(raw);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function requestChatMockText(
  prompt: string,
  options: { model?: string; reasoningEffort?: "low" | "medium" | "high" | "xhigh" } = {},
): Promise<{
  text: string;
  provenance: {
    provider: "chatmock";
    model: string;
    reasoningEffort: string | null;
    requestedAt: string;
  };
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), contentRequestTimeoutMs());
  const model = options.model ?? getContentChatMockModel();
  const requestedAt = new Date().toISOString();
  try {
    const response = await fetch(`${baseUrl()}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        stream: true,
        ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      if (response.status === 401) {
        throw new ApiError(
          "UNAUTHENTICATED",
          "ChatMock 인증이 필요합니다. 터미널에서 `chatmock login`을 실행해 주세요.",
        );
      }
      if (response.status === 429) {
        throw new ApiError("RATE_LIMITED", "ChatMock 계정의 사용량 한도에 도달했습니다.");
      }
      throw new ApiError("INTERNAL", `ChatMock 콘텐츠 요청에 실패했습니다. (HTTP ${response.status})`);
    }
    const text = payload ? outputText(payload).trim() : "";
    if (!text) throw new ApiError("INTERNAL", "ChatMock이 비어 있는 응답을 반환했습니다.");
    return {
      text,
      provenance: {
        provider: "chatmock",
        model,
        reasoningEffort: options.reasoningEffort ?? null,
        requestedAt,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "ChatMock 콘텐츠 요청 시간이 초과되었습니다."
        : "ChatMock에 연결하지 못했습니다. `chatmock serve` 실행 상태를 확인해 주세요.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function getChatMockContentCapability(): Promise<ChatMockContentCapability> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  const model = getContentChatMockModel();
  try {
    const response = await fetch(new URL("../health", `${baseUrl()}/`).toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok
      ? { enabled: true, reason: null, model }
      : { enabled: false, reason: "ChatMock 서버가 준비되지 않았습니다.", model };
  } catch {
    return {
      enabled: false,
      reason: "`chatmock login` 후 `chatmock serve`를 실행해 주세요.",
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}
