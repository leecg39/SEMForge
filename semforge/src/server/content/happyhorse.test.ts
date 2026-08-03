import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { getHappyHorseCapability, pollHappyHorseScene, submitHappyHorseScene } from "@/server/content/happyhorse";

const originalFetch = globalThis.fetch;
const originalEnv = {
  apiKey: process.env.DASHSCOPE_API_KEY,
  workspaceId: process.env.DASHSCOPE_WORKSPACE_ID,
  region: process.env.DASHSCOPE_REGION,
  baseUrl: process.env.DASHSCOPE_BASE_URL,
  model: process.env.HAPPYHORSE_VIDEO_MODEL,
};

beforeEach(() => {
  process.env.DASHSCOPE_API_KEY = "test-key";
  process.env.DASHSCOPE_WORKSPACE_ID = "workspace-123";
  process.env.DASHSCOPE_REGION = "ap-southeast-1";
  delete process.env.DASHSCOPE_BASE_URL;
  process.env.HAPPYHORSE_VIDEO_MODEL = "happyhorse-1.1-i2v";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    const envKey = ({ apiKey: "DASHSCOPE_API_KEY", workspaceId: "DASHSCOPE_WORKSPACE_ID", region: "DASHSCOPE_REGION", baseUrl: "DASHSCOPE_BASE_URL", model: "HAPPYHORSE_VIDEO_MODEL" } as const)[key as keyof typeof originalEnv];
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = value;
  }
});

test("HappyHorse 제출은 키프레임을 first_frame으로 보내고 task ID를 보존한다", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ output: { task_id: "task-1" }, request_id: "req-1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await submitHappyHorseScene({
    prompt: "camera slowly pushes forward",
    keyframe: Buffer.from("webp"),
    keyframeMimeType: "image/webp",
    duration: 7,
  });
  assert.match(requestUrl, /^https:\/\/workspace-123\.ap-southeast-1\.maas\.aliyuncs\.com/u);
  const input = requestBody.input as { media: Array<{ type: string; url: string }> };
  const parameters = requestBody.parameters as { resolution: string; duration: number; watermark: boolean };
  assert.equal(input.media[0].type, "first_frame");
  assert.match(input.media[0].url, /^data:image\/webp;base64,/u);
  assert.deepEqual(parameters, { resolution: "720P", duration: 7, watermark: false });
  assert.equal(result.taskId, "task-1");
  assert.equal(result.requestId, "req-1");
});

test("HappyHorse polling은 공급자 상태와 임시 URL을 내부 상태로 정규화한다", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    output: { task_status: "SUCCEEDED", video_url: "https://cdn.example.com/scene.mp4" },
    request_id: "req-2",
    usage: { video_duration: 7 },
  }), { status: 200, headers: { "content-type": "application/json" } });
  const result = await pollHappyHorseScene("task-1");
  assert.equal(result.status, "succeeded");
  assert.equal(result.videoUrl, "https://cdn.example.com/scene.mp4");
  assert.equal(result.requestId, "req-2");
});

test("Singapore 설정에 API 키나 workspace ID가 없으면 실행을 비활성화한다", () => {
  delete process.env.DASHSCOPE_API_KEY;
  assert.equal(getHappyHorseCapability().enabled, false);
  process.env.DASHSCOPE_API_KEY = "test-key";
  delete process.env.DASHSCOPE_WORKSPACE_ID;
  assert.match(getHappyHorseCapability().reason ?? "", /WORKSPACE_ID/u);
});
