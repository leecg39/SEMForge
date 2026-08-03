import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import {
  getXaiVideoCapability,
  pollXaiVideoScene,
  submitXaiVideoScene,
  verifyXaiVideoAccess,
} from "@/server/content/xai-video";

const originalFetch = globalThis.fetch;
const originalKey = process.env.XAI_API_KEY;
const originalModel = process.env.XAI_VIDEO_MODEL;

beforeEach(() => {
  process.env.XAI_API_KEY = "test-xai-key";
  process.env.XAI_VIDEO_MODEL = "grok-imagine-video-1.5";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.XAI_VIDEO_MODEL;
  else process.env.XAI_VIDEO_MODEL = originalModel;
});

test("xAI 영상 제출은 같은 XAI_API_KEY로 키프레임 기반 생성을 요청한다", async () => {
  let requestUrl = "";
  let authorization = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ request_id: "video-request-1" });
  };

  const result = await submitXaiVideoScene({
    prompt: "camera slowly pushes forward",
    keyframe: Buffer.from("webp"),
    keyframeMimeType: "image/webp",
    duration: 7,
    aspectRatio: "16:9",
  });

  assert.equal(requestUrl, "https://api.x.ai/v1/videos/generations");
  assert.equal(authorization, "Bearer test-xai-key");
  assert.equal(requestBody.model, "grok-imagine-video-1.5");
  assert.equal(requestBody.duration, 7);
  assert.equal(requestBody.aspect_ratio, "16:9");
  assert.equal(requestBody.resolution, "720p");
  assert.match((requestBody.image as { url: string }).url, /^data:image\/webp;base64,/u);
  assert.equal(result.taskId, "video-request-1");
});

test("xAI 영상 polling은 완료 URL과 사용량을 정규화한다", async () => {
  globalThis.fetch = async () => Response.json({
    status: "done",
    video: { url: "https://vidgen.x.ai/video.mp4", duration: 7, respect_moderation: true },
    model: "grok-imagine-video-1.5",
    usage: { cost_in_usd_ticks: 1_000_000 },
  });

  const result = await pollXaiVideoScene("video-request-1");
  assert.equal(result.status, "succeeded");
  assert.equal(result.videoUrl, "https://vidgen.x.ai/video.mp4");
  assert.deepEqual(result.usage, { cost_in_usd_ticks: 1_000_000 });
});

test("xAI 영상 권한 검증은 설정한 모델의 접근 가능 여부를 확인한다", async () => {
  globalThis.fetch = async () => Response.json({
    models: [{ id: "grok-imagine-video-1.5", input_modalities: ["text", "image"], output_modalities: ["video"] }],
  });

  const capability = await verifyXaiVideoAccess();
  assert.equal(capability.enabled, true);
  assert.equal(capability.model, "grok-imagine-video-1.5");
});

test("xAI 영상 API의 403은 키 권한과 결제 설정 오류로 안내한다", async () => {
  globalThis.fetch = async () => Response.json({ code: "permission-denied" }, { status: 403 });
  await assert.rejects(
    () => pollXaiVideoScene("video-request-1"),
    /팀 권한과 결제 설정/u,
  );
});

test("XAI_API_KEY가 없으면 영상 공급자를 비활성화한다", () => {
  delete process.env.XAI_API_KEY;
  assert.equal(getXaiVideoCapability().enabled, false);
  assert.match(getXaiVideoCapability().reason ?? "", /XAI_API_KEY/u);
});
