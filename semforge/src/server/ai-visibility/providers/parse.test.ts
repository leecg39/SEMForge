import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectBrandMention,
  normalizeDomainList,
  parseProviderOutput,
} from "@/server/ai-visibility/providers/parse";

test("답변 본문과 끝에 붙은 JSON 을 분리한다", () => {
  const raw = [
    "정책자금은 중진공 상담을 먼저 받는 편이 안전하다.",
    '{"brands":["중소벤처기업진흥공단","기업마당"],"sources":["kosmes.or.kr","bizinfo.go.kr"]}',
  ].join("\n");
  const parsed = parseProviderOutput(raw);
  assert.equal(parsed.answerText, "정책자금은 중진공 상담을 먼저 받는 편이 안전하다.");
  assert.deepEqual(parsed.mentionedBrands, ["중소벤처기업진흥공단", "기업마당"]);
  assert.deepEqual(parsed.citedDomains, ["kosmes.or.kr", "bizinfo.go.kr"]);
});

test("마크다운 코드펜스로 감싼 JSON 도 처리한다", () => {
  const raw = '답변입니다.\n```json\n{"brands":["A"],"sources":["a.com"]}\n```';
  const parsed = parseProviderOutput(raw);
  assert.equal(parsed.answerText, "답변입니다.");
  assert.deepEqual(parsed.mentionedBrands, ["A"]);
});

test("JSON 이 없으면 전체를 본문으로 두고 목록은 비운다", () => {
  // 모델이 형식을 안 지켜도 본문은 보존해야 한다. 빈 배열을 "언급 없음"으로 확정하지 않는다.
  const parsed = parseProviderOutput("그냥 평범한 답변입니다.");
  assert.equal(parsed.answerText, "그냥 평범한 답변입니다.");
  assert.deepEqual(parsed.mentionedBrands, []);
  assert.deepEqual(parsed.citedDomains, []);
  assert.equal(parsed.structured, false);
});

test("깨진 JSON 은 예외 없이 무시하고 본문을 살린다", () => {
  const parsed = parseProviderOutput('본문\n{"brands":[Broken');
  assert.equal(parsed.structured, false);
  assert.ok(parsed.answerText.includes("본문"));
});

test("JSON 이 여러 개면 마지막 것을 쓴다", () => {
  const raw = '{"brands":["구버전"],"sources":[]}\n본문\n{"brands":["최신"],"sources":["b.com"]}';
  const parsed = parseProviderOutput(raw);
  assert.deepEqual(parsed.mentionedBrands, ["최신"]);
});

test("빈 응답은 본문 없음으로 표시한다", () => {
  const parsed = parseProviderOutput("   \n  ");
  assert.equal(parsed.answerText, "");
  assert.equal(parsed.structured, false);
});

test("도메인 목록을 소문자·www 제거로 정규화하고 중복을 없앤다", () => {
  assert.deepEqual(
    normalizeDomainList(["WWW.Example.com", "https://example.com/path", "example.com", " b.co "]),
    ["example.com", "b.co"]
  );
  assert.deepEqual(normalizeDomainList(["", "   ", "not a domain"]), []);
});

test("인용 도메인에 자사 도메인이 있으면 언급으로 판정하고 순위를 매긴다", () => {
  const result = detectBrandMention({
    domain: "bizinfo.go.kr",
    answerText: "기업마당을 참고하세요.",
    mentionedBrands: ["중진공", "기업마당"],
    citedDomains: ["kosmes.or.kr", "bizinfo.go.kr"],
  });
  assert.equal(result.brandMentioned, true);
  assert.equal(result.brandRank, 2);
});

test("서브도메인도 자사 도메인으로 인정한다", () => {
  const result = detectBrandMention({
    domain: "soverin.cloud",
    answerText: "",
    mentionedBrands: [],
    citedDomains: ["smb.soverin.cloud"],
  });
  assert.equal(result.brandMentioned, true);
});

test("유사 도메인은 언급으로 세지 않는다", () => {
  const result = detectBrandMention({
    domain: "soverin.cloud",
    answerText: "",
    mentionedBrands: [],
    citedDomains: ["notsoverin.cloud"],
  });
  assert.equal(result.brandMentioned, false);
  assert.equal(result.brandRank, null);
});

test("구조화 실패 시에는 언급 여부를 단정하지 않고 null 로 둔다", () => {
  // 모델이 형식을 안 지킨 경우 "언급 없음(false)"으로 확정하면 가짜 0% 가시성이 만들어진다.
  const result = detectBrandMention({
    domain: "example.com",
    answerText: "본문만 있음",
    mentionedBrands: [],
    citedDomains: [],
    structured: false,
  });
  assert.equal(result.brandMentioned, null);
  assert.equal(result.brandRank, null);
});
