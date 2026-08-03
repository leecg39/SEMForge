import assert from "node:assert/strict";
import test from "node:test";
import {
  parseHiddenWidgets,
  preferenceStorageKey,
} from "@/components/seo-dash/widget-preferences";

test("parseHiddenWidgets는 지원하는 고유 위젯 식별자만 복원한다", () => {
  assert.deepEqual(
    parseHiddenWidgets(JSON.stringify(["aiSearch", "unknown", "aiSearch", "backlinks"])),
    ["aiSearch", "backlinks"],
  );
  assert.deepEqual(parseHiddenWidgets("not-json"), []);
});

test("preferenceStorageKey는 버전과 불투명 범위를 포함한다", () => {
  assert.equal(
    preferenceStorageKey("abc123"),
    "semforge:seo-dashboard:v1:abc123",
  );
});
