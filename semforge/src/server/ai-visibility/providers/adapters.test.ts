import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCollectionPrompt } from "@/server/ai-visibility/providers/parse";
import { createCursorGrokProvider } from "@/server/ai-visibility/providers/cursor-grok";
import { createXaiProvider } from "@/server/ai-visibility/providers/xai";
import { selectAnswerProvider } from "@/server/ai-visibility/providers";

const request = { prompt: "정책자금 컨설팅 추천해줘", domain: "example.com" };

test("수집 프롬프트에는 대상 도메인을 넣지 않는다", () => {
  // 도메인을 알려주면 모델이 그것을 언급하도록 유도되어 측정 자체가 무의미해진다.
  const built = buildCollectionPrompt(request);
  assert.ok(built.includes(request.prompt));
  assert.ok(!built.includes("example.com"), `프롬프트에 대상 도메인이 새면 안 된다: ${built}`);
  assert.ok(built.includes("brands") && built.includes("sources"), "JSON 계약을 명시해야 한다");
});

test("cursor-grok: 실행기 성공 시 파싱 결과를 담은 live 결과를 낸다", async () => {
  const provider = createCursorGrokProvider({
    runner: async () => ({
      ok: true,
      stdout: '본문 답변입니다.\n{"brands":["기업마당"],"sources":["example.com","b.co"]}',
    }),
  });
  const result = await provider.collect(request);
  assert.equal(result.status, "live");
  assert.equal(result.data?.answerText, "본문 답변입니다.");
  assert.equal(result.data?.brandMentioned, true);
  assert.equal(result.data?.brandRank, 1);
  assert.equal(result.data?.platform, "grok");
  // 계정 인증 경로도 실제 모델 호출이므로 과금으로 표시한다.
  assert.equal(result.data?.billed, true);
});

test("cursor-grok: 형식을 안 지킨 응답은 언급 여부를 null 로 남긴다", async () => {
  const provider = createCursorGrokProvider({
    runner: async () => ({ ok: true, stdout: "그냥 줄글 답변" }),
  });
  const result = await provider.collect(request);
  assert.equal(result.status, "live");
  assert.equal(result.data?.structured, false);
  assert.equal(result.data?.brandMentioned, null);
});

test("cursor-grok: 실행 실패는 error 로 사유와 함께 보고한다", async () => {
  const provider = createCursorGrokProvider({
    runner: async () => ({ ok: false, stdout: "", error: "command not found" }),
  });
  const result = await provider.collect(request);
  assert.equal(result.status, "error");
  assert.match(result.reason ?? "", /command not found|실행/);
});

test("cursor-grok: 빈 응답을 성공으로 저장하지 않는다", async () => {
  const provider = createCursorGrokProvider({ runner: async () => ({ ok: true, stdout: "   " }) });
  const result = await provider.collect(request);
  assert.equal(result.status, "error");
});

test("cursor-grok 은 배포 가능 경로가 아니라고 스스로 표시한다", () => {
  const provider = createCursorGrokProvider({ runner: async () => ({ ok: true, stdout: "x" }) });
  assert.equal(provider.deployable, false);
  assert.equal(provider.platform, "grok");
});

test("xai: 키가 없으면 호출하지 않고 unavailable 을 낸다", async () => {
  let called = false;
  const provider = createXaiProvider({
    apiKey: null,
    fetchImpl: async () => {
      called = true;
      return new Response("{}");
    },
  });
  const result = await provider.collect(request);
  assert.equal(result.status, "unavailable");
  assert.equal(called, false, "키가 없으면 네트워크를 건드리면 안 된다");
});

test("xai: 크레딧 부족(403)은 사유를 그대로 전달한다", async () => {
  const provider = createXaiProvider({
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ code: "permission-denied", error: "no credits" }), {
        status: 403,
      }),
  });
  const result = await provider.collect(request);
  assert.equal(result.status, "error");
  assert.match(result.reason ?? "", /크레딧|no credits|403/);
});

test("xai: 정상 응답은 파싱해 live 로 낸다", async () => {
  const provider = createXaiProvider({
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: '답변\n{"brands":["A"],"sources":["example.com"]}' } },
          ],
        }),
        { status: 200 }
      ),
  });
  const result = await provider.collect(request);
  assert.equal(result.status, "live");
  assert.equal(result.data?.brandMentioned, true);
  assert.equal(result.data?.billed, true);
  assert.equal(result.data?.platform, "grok");
});

test("제공자 선택은 env 로 바뀌며 기본값은 계정 인증 경로다", () => {
  assert.equal(selectAnswerProvider({}).id, "cursor-grok");
  assert.equal(selectAnswerProvider({ AI_ANSWER_PROVIDER: "xai" }).id, "xai");
  assert.equal(selectAnswerProvider({ AI_ANSWER_PROVIDER: "cursor-grok" }).id, "cursor-grok");
});

test("알 수 없는 제공자 이름은 조용히 넘기지 않고 거부한다", () => {
  assert.throws(() => selectAnswerProvider({ AI_ANSWER_PROVIDER: "openai" }), /제공자/);
});
