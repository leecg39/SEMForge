import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStoredHiddenWidgets,
  seoProjectSettingsPatchSchema,
} from "./seo-project-settings";

test("SEO 프로젝트 설정은 국가 코드를 대문자로 정규화하고 숨긴 위젯 중복을 제거한다", () => {
  const parsed = seoProjectSettingsPatchSchema.parse({
    countryCode: "kr",
    hiddenWidgets: ["backlinks", "backlinks", "aiSearch"],
  });

  assert.equal(parsed.countryCode, "KR");
  assert.deepEqual(parsed.hiddenWidgets, ["backlinks", "aiSearch"]);
});

test("SEO 프로젝트 설정은 미지원 위젯과 빈 패치를 거부한다", () => {
  assert.equal(seoProjectSettingsPatchSchema.safeParse({}).success, false);
  assert.equal(
    seoProjectSettingsPatchSchema.safeParse({ hiddenWidgets: ["unknown"] }).success,
    false,
  );
});

test("저장된 숨김 위젯 JSON이 손상되면 안전하게 빈 목록을 반환한다", () => {
  assert.deepEqual(parseStoredHiddenWidgets("not-json"), []);
  assert.deepEqual(parseStoredHiddenWidgets('["backlinks","unknown"]'), []);
  assert.deepEqual(parseStoredHiddenWidgets('["backlinks","backlinks"]'), ["backlinks"]);
});
