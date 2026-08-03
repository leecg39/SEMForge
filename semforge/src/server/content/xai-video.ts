import { ApiError } from "@/lib/api";

const DEFAULT_MODEL = "grok-imagine-video-1.5";
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const XAI_API_BASE = "https://api.x.ai";

type JsonObject = Record<string, unknown>;

export type XaiVideoCapability = {
  enabled: boolean;
  reason: string | null;
  model: string;
};

function configuration() {
  return {
    apiKey: process.env.XAI_API_KEY?.trim() ?? "",
    model: process.env.XAI_VIDEO_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export function getXaiVideoCapability(): XaiVideoCapability {
  const config = configuration();
  return {
    enabled: Boolean(config.apiKey),
    reason: config.apiKey ? null : "XAI_API_KEY가 필요합니다.",
    model: config.model,
  };
}

export async function verifyXaiVideoAccess(): Promise<XaiVideoCapability> {
  const capability = getXaiVideoCapability();
  if (!capability.enabled) throw new ApiError("VALIDATION_ERROR", capability.reason ?? "XAI_API_KEY가 필요합니다.");
  const config = configuration();
  let response: Response;
  try {
    response = await fetch(`${XAI_API_BASE}/v1/video-generation-models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError("INTERNAL", "xAI 영상 모델 권한을 확인하지 못했습니다.");
  }
  const payload = await json(response);
  if (!response.ok) providerError(response, payload);
  const models = Array.isArray(payload.models)
    ? payload.models.flatMap((value) => value && typeof value === "object" && typeof (value as JsonObject).id === "string" ? [(value as JsonObject).id as string] : [])
    : [];
  if (!models.includes(config.model)) {
    throw new ApiError("VALIDATION_ERROR", `현재 xAI API 키에서 ${config.model} 모델을 사용할 수 없습니다.`);
  }
  return capability;
}

async function json(response: Response): Promise<JsonObject> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? value as JsonObject : {};
  } catch {
    return {};
  }
}

function payloadMessage(payload: JsonObject): string | null {
  if (typeof payload.message === "string") return payload.message;
  if (payload.error && typeof payload.error === "object") {
    const message = (payload.error as JsonObject).message;
    if (typeof message === "string") return message;
  }
  return null;
}

function providerError(response: Response, payload: JsonObject): never {
  if (response.status === 401) {
    throw new ApiError("UNAUTHENTICATED", "XAI_API_KEY가 올바른지 확인해 주세요.");
  }
  if (response.status === 403) {
    throw new ApiError("UNAUTHENTICATED", "xAI API 권한이 거부되었습니다. xAI Console에서 API 키의 팀 권한과 결제 설정을 확인해 주세요.");
  }
  if (response.status === 402) throw new ApiError("PLAN_LIMIT", "xAI 영상 생성 크레딧이 부족합니다.");
  if (response.status === 429) throw new ApiError("RATE_LIMITED", "xAI 영상 생성 사용량 한도에 도달했습니다.");
  const message = payloadMessage(payload);
  throw new ApiError("INTERNAL", `xAI 영상 생성 요청에 실패했습니다. (HTTP ${response.status}${message ? ` · ${message}` : ""})`);
}

export async function submitXaiVideoScene(input: {
  prompt: string;
  keyframe: Buffer;
  keyframeMimeType: "image/webp" | "image/jpeg" | "image/png";
  duration: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
}): Promise<{ taskId: string; requestId: string; model: string; submittedAt: string }> {
  const config = configuration();
  if (!config.apiKey) throw new ApiError("VALIDATION_ERROR", "XAI_API_KEY가 필요합니다.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${XAI_API_BASE}/v1/videos/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        prompt: input.prompt,
        image: { url: `data:${input.keyframeMimeType};base64,${input.keyframe.toString("base64")}` },
        duration: input.duration,
        aspect_ratio: input.aspectRatio,
        resolution: "720p",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await json(response);
    if (!response.ok) providerError(response, payload);
    const requestId = typeof payload.request_id === "string" ? payload.request_id : "";
    if (!requestId) throw new ApiError("INTERNAL", "xAI가 영상 request_id를 반환하지 않았습니다.");
    return {
      taskId: requestId,
      requestId,
      model: config.model,
      submittedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "xAI 영상 제출 응답이 불확실합니다. 비용 중복을 막기 위해 자동 재제출하지 않습니다."
        : "xAI 영상 API에 연결하지 못했습니다.",
      { details: { uncertainSubmission: controller.signal.aborted } },
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function pollXaiVideoScene(taskId: string): Promise<{
  status: "pending" | "succeeded" | "failed" | "unknown";
  requestId: string;
  videoUrl: string | null;
  error: string | null;
  usage: JsonObject;
}> {
  const config = configuration();
  if (!config.apiKey) throw new ApiError("VALIDATION_ERROR", "XAI_API_KEY가 필요합니다.");
  let response: Response;
  try {
    response = await fetch(`${XAI_API_BASE}/v1/videos/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError("INTERNAL", "xAI 영상 생성 상태를 확인하지 못했습니다.");
  }
  const payload = await json(response);
  if (!response.ok) providerError(response, payload);
  const providerStatus = typeof payload.status === "string" ? payload.status.toLowerCase() : "unknown";
  const video = payload.video && typeof payload.video === "object" ? payload.video as JsonObject : {};
  const respectsModeration = video.respect_moderation !== false;
  const status = providerStatus === "done" && respectsModeration
    ? "succeeded"
    : providerStatus === "failed" || (providerStatus === "done" && !respectsModeration)
      ? "failed"
      : providerStatus === "expired" || providerStatus === "unknown"
        ? "unknown"
        : "pending";
  return {
    status,
    requestId: taskId,
    videoUrl: status === "succeeded" && typeof video.url === "string" ? video.url : null,
    error: !respectsModeration ? "xAI 콘텐츠 정책에 따라 영상이 필터링되었습니다." : payloadMessage(payload),
    usage: payload.usage && typeof payload.usage === "object" ? payload.usage as JsonObject : {},
  };
}

function isPublicHttps(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return !(
    host === "localhost"
    || host.endsWith(".local")
    || host === "127.0.0.1"
    || host === "::1"
    || /^10\./u.test(host)
    || /^192\.168\./u.test(host)
    || /^169\.254\./u.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])\./u.test(host)
  );
}

export async function downloadXaiVideo(rawUrl: string): Promise<Buffer> {
  const url = new URL(rawUrl);
  if (!isPublicHttps(url)) throw new ApiError("VALIDATION_ERROR", "xAI 결과 URL이 안전하지 않습니다.");
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new ApiError("INTERNAL", `xAI 영상 다운로드에 실패했습니다. (HTTP ${response.status})`);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "video/mp4" && contentType !== "application/octet-stream") {
    throw new ApiError("VALIDATION_ERROR", "xAI 결과가 MP4 영상이 아닙니다.");
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_VIDEO_BYTES) {
    throw new ApiError("VALIDATION_ERROR", "xAI 영상 파일이 허용 크기를 초과했습니다.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES) {
    throw new ApiError("VALIDATION_ERROR", "xAI 영상 파일 크기가 올바르지 않습니다.");
  }
  return bytes;
}
