import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonthlyRefDomains,
  createSeoPreferenceScope,
  selectSeoDashboardProject,
  selectSeoSiteAuditCampaign,
} from "@/server/seo-dashboard/snapshot";

const auditCampaign = (
  id: string,
  folderId: string | null,
  domain: string,
): Parameters<typeof selectSeoSiteAuditCampaign>[0][number] => ({
  id,
  folderId,
  domain,
  status: "completed",
});

test("프로젝트가 없으면 선택 도메인도 비워 둔다", () => {
  assert.deepEqual(selectSeoDashboardProject([], "w1", "outside.test"), {
    projects: [],
    project: null,
    currentDomain: "",
  });
});

test("도메인을 정규화하고 같은 도메인의 최신 프로젝트를 선택한다", () => {
  const selected = selectSeoDashboardProject(
    [
      { id: "old", workspaceId: "w1", name: "이전", domain: "www.Example.com", updatedAt: new Date("2026-01-01") },
      { id: "new", workspaceId: "w1", name: "최신", domain: "example.com", updatedAt: new Date("2026-08-01") },
    ],
    "w1",
    "https://www.example.com/path",
  );

  assert.equal(selected.projects.length, 1);
  assert.equal(selected.project?.id, "new");
  assert.equal(selected.currentDomain, "example.com");
});

test("다른 워크스페이스 프로젝트는 목록과 domain 선택에서 차단한다", () => {
  const selected = selectSeoDashboardProject(
    [
      { id: "mine", workspaceId: "w1", name: "내 프로젝트", domain: "mine.test", updatedAt: new Date("2026-07-01") },
      { id: "outside", workspaceId: "w2", name: "외부 프로젝트", domain: "outside.test", updatedAt: new Date("2026-08-01") },
    ],
    "w1",
    "outside.test",
  );

  assert.deepEqual(selected.projects.map((project) => project.id), ["mine"]);
  assert.equal(selected.project?.id, "mine");
  assert.equal(selected.currentDomain, "mine.test");
});

test("사이트 진단은 도메인 문자열보다 프로젝트 folder_id 연결을 우선한다", () => {
  const selected = selectSeoSiteAuditCampaign(
    [
      auditCampaign("linked", "folder-1", "legacy.example"),
      auditCampaign("domain-only", null, "www.example.com"),
    ],
    "folder-1",
    "example.com",
  );

  assert.equal(selected?.id, "linked");
});

test("folder_id 도입 전 진단만 정규화 도메인으로 연결한다", () => {
  const selected = selectSeoSiteAuditCampaign(
    [
      auditCampaign("other-project", "folder-2", "www.example.com"),
      auditCampaign("legacy", null, "https://www.Example.com/path"),
    ],
    "folder-1",
    "example.com",
  );

  assert.equal(selected?.id, "legacy");
});

test("다른 프로젝트에 연결된 같은 도메인 진단은 재사용하지 않는다", () => {
  const selected = selectSeoSiteAuditCampaign(
    [auditCampaign("other-project", "folder-2", "www.example.com")],
    "folder-1",
    "example.com",
  );

  assert.equal(selected, null);
});

test("buildMonthlyRefDomains는 크롤러가 관측한 링크를 월별 누적으로 집계한다", () => {
  const result = buildMonthlyRefDomains(
    [
      { sourceDomain: "alpha.example", firstSeenAt: new Date("2025-09-15T00:00:00Z") },
      { sourceDomain: "beta.example", firstSeenAt: new Date("2026-01-15T00:00:00Z") },
      { sourceDomain: "alpha.example", firstSeenAt: new Date("2026-02-05T00:00:00Z") },
    ],
    new Date("2026-08-02T00:00:00Z"),
  );

  assert.equal(result.length, 12);
  assert.deepEqual(
    result.map((point) => [point.referringDomains, point.backlinks]),
    [
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
      [2, 2],
      [2, 3],
      [2, 3],
      [2, 3],
      [2, 3],
      [2, 3],
      [2, 3],
      [2, 3],
    ],
  );
});

test("createSeoPreferenceScope는 식별자를 노출하지 않는 안정적인 프로젝트 범위를 만든다", () => {
  const auth = { workspaceId: "wsp_private", userId: "usr_private" };
  const first = createSeoPreferenceScope(auth, "https://www.Example.com/path");
  const second = createSeoPreferenceScope(auth, "example.com");
  const other = createSeoPreferenceScope({ ...auth, userId: "usr_other" }, "example.com");

  assert.equal(first, second);
  assert.equal(first.length, 16);
  assert.notEqual(first, other);
  assert.equal(first.includes("wsp_private"), false);
  assert.equal(first.includes("usr_private"), false);
});
