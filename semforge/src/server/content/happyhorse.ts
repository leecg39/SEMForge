import { ApiError } from "@/lib/api";

const DEFAULT_MODEL = "happyhorse-1.1-i2v";
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

type JsonObject = Record<string, unknown>;

export type HappyHorseCapability = {
  enabled: boolean;
  reason: string | null;
  model: string;
  region: string;
};

function configuration() {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim() ?? "";
  const workspaceId = process.env.DASHSCOPE_WORKSPACE_ID?.trim() ?? "";
  const region = process.env.DASHSCOPE_REGION?.trim() || "ap-southeast-1";
  const model = process.env.HAPPYHORSE_VIDEO_MODEL?.trim() || DEFAULT_MODEL;
  let baseUrl: string;
  if (process.env.DASHSCOPE_BASE_URL?.trim()) {
    baseUrl = process.env.DASHSCOPE_BASE_URL.trim();
  } else if (region === "us-east-1") {
    baseUrl = "https://dashscope-us.aliyuncs.com";
  } else if (region === "ap-southeast-1") {
    baseUrl = workspaceId
      ? `https://${workspaceId}.ap-southeast-1.maas.aliyuncs.com`
      : "https://dashscope-intl.aliyuncs.com";
  } else {
    baseUrl = workspaceId
      ? `https://${workspaceId}.${region}.maas.aliyuncs.com`
      : "https://dashscope-intl.aliyuncs.com";
  }
  return { apiKey, workspaceId, region, model, baseUrl: baseUrl.replace(/\/+$/u, "") };
}

export function getHappyHorseCapability(): HappyHorseCapability {
  const config = configuration();
  if (!config.apiKey) {
    return { enabled: false, reason: "DASHSCOPE_API_KEY가 필요합니다.", model: config.model, region: config.region };
  }
  if (config.region === "ap-southeast-1" && !config.workspaceId && !process.env.DASHSCOPE_BASE_URL?.trim()) {
    return {
      enabled: false,
      reason: "Singapore 전용 엔드포인트에는 DASHSCOPE_WORKSPACE_ID가 필요합니다.",
      model: config.model,
      region: config.region,
    };
  }
  return { enabled: true, reason: null, model: config.model, region: config.region };
}

async function json(response: Response): Promise<JsonObject> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? value as JsonObject : {};
  } catch {
    return {};
  }
}

function providerError(response: Response, payload: JsonObject): never {
  const message = typeof payload.message === "string" ? payload.message : `HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    throw new ApiError("UNAUTHENTICATED", `HappyHorse 인증 정보를 확인해 주세요. (${message})`);
  }
  if (response.status === 402) throw new ApiError("PLAN_LIMIT", "HappyHorse 크레딧이 부족합니다.");
  if (response.status === 429) throw new ApiError("RATE_LIMITED", "HappyHorse 동시 실행 또는 사용량 한도에 도달했습니다.");
  throw new ApiError("INTERNAL", `HappyHorse 요청에 실패했습니다. (${message})`);
}

export async function submitHappyHorseScene(input: {
  prompt: string;
  keyframe: Buffer;
  keyframeMimeType: "image/webp" | "image/jpeg" | "image/png";
  duration: number;
  seed?: number | null;
}): Promise<{ taskId: string; requestId: string | null; model: string; submittedAt: string }> {
  const config = configuration();
  const capability = getHappyHorseCapability();
  if (!capability.enabled) throw new ApiError("VALIDATION_ERROR", capability.reason ?? "HappyHorse 설정이 필요합니다.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${config.baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: config.model,
        input: {
          prompt: input.prompt,
          media: [{
            type: "first_frame",
            url: `data:${input.keyframeMimeType};base64,${input.keyframe.toString("base64")}`,
          }],
        },
        parameters: {
          resolution: "720P",
          duration: input.duration,
          watermark: false,
          ...(input.seed === null || input.seed === undefined ? {} : { seed: input.seed }),
        },
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await json(response);
    if (!response.ok) providerError(response, payload);
    const output = payload.output && typeof payload.output === "object" ? payload.output as JsonObject : {};
    const taskId = typeof output.task_id === "string" ? output.task_id : "";
    if (!taskId) throw new ApiError("INTERNAL", "HappyHorse가 task_id를 반환하지 않았습니다.");
    return {
      taskId,
      requestId: typeof payload.request_id === "string" ? payload.request_id : null,
      model: config.model,
      submittedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "HappyHorse 제출 응답이 불확실합니다. 비용 중복을 막기 위해 자동 재제출하지 않습니다."
        : "HappyHorse에 연결하지 못했습니다.",
      { details: { uncertainSubmission: controller.signal.aborted } },
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function pollHappyHorseScene(taskId: string): Promise<{
  status: "pending" | "succeeded" | "failed" | "unknown";
  requestId: string | null;
  videoUrl: string | null;
  error: string | null;
  usage: JsonObject;
}> {
  const config = configuration();
  const response = await fetch(`${config.baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await json(response);
  if (!response.ok) providerError(response, payload);
  const output = payload.output && typeof payload.output === "object" ? payload.output as JsonObject : {};
  const providerStatus = typeof output.task_status === "string" ? output.task_status : "UNKNOWN";
  return {
    status: providerStatus === "SUCCEEDED"
      ? "succeeded"
      : providerStatus === "FAILED" || providerStatus === "CANCELED"
        ? "failed"
        : providerStatus === "UNKNOWN"
          ? "unknown"
          : "pending",
    requestId: typeof payload.request_id === "string" ? payload.request_id : null,
    videoUrl: typeof output.video_url === "string" ? output.video_url : null,
    error: typeof output.message === "string" ? output.message : null,
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

export async function downloadHappyHorseVideo(rawUrl: string): Promise<Buffer> {
  const url = new URL(rawUrl);
  if (!isPublicHttps(url)) throw new ApiError("VALIDATION_ERROR", "HappyHorse 결과 URL이 안전하지 않습니다.");
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new ApiError("INTERNAL", `HappyHorse 영상 다운로드에 실패했습니다. (HTTP ${response.status})`);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "video/mp4" && contentType !== "application/octet-stream") {
    throw new ApiError("VALIDATION_ERROR", "HappyHorse 결과가 MP4 영상이 아닙니다.");
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_VIDEO_BYTES) {
    throw new ApiError("VALIDATION_ERROR", "HappyHorse 영상 파일이 허용 크기를 초과했습니다.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES) {
    throw new ApiError("VALIDATION_ERROR", "HappyHorse 영상 파일 크기가 올바르지 않습니다.");
  }
  return bytes;
}
