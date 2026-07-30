/**
 * CRUD 기능 검증 스크립트.
 *
 * 실행: node scripts/verify-crud.mjs [baseUrl]
 * 사전 조건: npm run db:reset 으로 시드된 DB + 서버 실행 중.
 *
 * 검증 범위: 인증, 목록/검색/필터/정렬/페이지네이션, 생성/수정/삭제/복구/영구삭제,
 * 필수값·형식·중복·버전 충돌, 역할 권한, 소유권, 관계 데이터 연쇄, 일괄 작업,
 * 내보내기, 감사 로그, 로그인 레이트 리밋.
 */

const BASE = process.argv[2] ?? "http://localhost:4320";
/** 반복 실행해도 유일 제약과 충돌하지 않도록 실행마다 접미사를 붙인다. */
const RUN = Date.now().toString(36).slice(-5);

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail });
    console.log(`  FAIL  ${name}${detail ? ` → ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** 쿠키를 보관하는 간단한 세션 클라이언트 */
function createClient() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async request(path, options = {}) {
      const response = await fetch(`${BASE}${path}`, {
        ...options,
        redirect: "manual",
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...options.headers,
        },
      });
      const setCookie = response.headers.getSetCookie?.() ?? [];
      for (const raw of setCookie) {
        const [pair] = raw.split(";");
        if (pair.startsWith("sc_session=")) cookie = pair;
      }
      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
      return { status: response.status, body, contentType };
    },
    get(path) {
      return this.request(path);
    },
    post(path, payload) {
      return this.request(path, {
        method: "POST",
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    },
    patch(path, payload) {
      return this.request(path, { method: "PATCH", body: JSON.stringify(payload) });
    },
    delete(path) {
      return this.request(path, { method: "DELETE" });
    },
  };
}

async function login(client, email, password = "password1234") {
  return client.post("/api/auth/login/", { email, password });
}

async function main() {
  console.log(`검증 대상: ${BASE}`);

  /* ---------------------------- A. 인증 ---------------------------- */
  section("A. 인증");
  const anon = createClient();
  const anonList = await anon.get("/api/folders/");
  check(
    "A1 미인증 목록 요청은 401",
    anonList.status === 401 && anonList.body?.error?.code === "UNAUTHENTICATED",
    `status=${anonList.status}`
  );

  const badLogin = await login(anon, "owner@example.com", "wrong-password");
  check(
    "A2 잘못된 비밀번호는 401이고 이메일 존재 여부를 노출하지 않음",
    badLogin.status === 401 &&
      badLogin.body?.error?.message === "이메일 또는 비밀번호가 올바르지 않습니다.",
    `status=${badLogin.status} msg=${badLogin.body?.error?.message}`
  );

  const owner = createClient();
  const ownerLogin = await login(owner, "owner@example.com");
  check(
    "A3 정상 로그인은 200이고 세션 쿠키를 발급",
    ownerLogin.status === 200 && owner.cookie.startsWith("sc_session="),
    `status=${ownerLogin.status}`
  );

  const me = await owner.get("/api/auth/me/");
  check(
    "A4 /api/auth/me 가 역할과 권한을 반환",
    me.status === 200 && me.body?.data?.role === "owner" && me.body?.data?.capabilities?.purge === true,
    JSON.stringify(me.body?.data?.role)
  );

  /* ------------------------- B. 목록 조회 ------------------------- */
  section("B. 목록 · 검색 · 필터 · 정렬 · 페이지네이션");
  const list = await owner.get("/api/folders/");
  check(
    "B1 폴더 목록 조회(활성 4건, 휴지통 제외)",
    list.status === 200 && list.body.data.length === 4 && list.body.meta.total === 4,
    `count=${list.body?.data?.length} total=${list.body?.meta?.total}`
  );

  check(
    "B2 기본 정렬에서 핀 고정 폴더가 최상단",
    list.body.data[0]?.pinned === true,
    `first=${list.body.data[0]?.name}`
  );

  const search = await owner.get("/api/folders/?q=northwind");
  check(
    "B3 검색은 이름과 도메인 모두 대상",
    search.status === 200 && search.body.data.length === 1,
    `count=${search.body?.data?.length}`
  );

  const searchNone = await owner.get("/api/folders/?q=존재하지않는검색어zzz");
  check(
    "B4 결과 없는 검색은 200 + 빈 배열",
    searchNone.status === 200 && searchNone.body.data.length === 0 && searchNone.body.meta.total === 0
  );

  const owningMy = await owner.get("/api/folders/?owning=my");
  check(
    "B5 소유권 필터(내 소유)가 생성자 기준으로 동작",
    owningMy.status === 200 && owningMy.body.data.every((row) => row.createdBy),
    `count=${owningMy.body?.data?.length}`
  );

  const paged = await owner.get("/api/folders/?pageSize=2&page=2");
  check(
    "B6 페이지네이션 meta 정확",
    paged.status === 200 &&
      paged.body.data.length === 2 &&
      paged.body.meta.page === 2 &&
      paged.body.meta.totalPages === 2,
    JSON.stringify(paged.body?.meta)
  );

  const badSort = await owner.get("/api/folders/?sort=passwordHash:desc");
  check(
    "B7 허용되지 않은 정렬 필드는 400",
    badSort.status === 400 && badSort.body?.error?.code === "VALIDATION_ERROR",
    `status=${badSort.status}`
  );

  const bigPage = await owner.get("/api/folders/?pageSize=9999");
  check(
    "B8 pageSize 는 100으로 상한 적용",
    bigPage.body?.meta?.pageSize === 100,
    `pageSize=${bigPage.body?.meta?.pageSize}`
  );

  const filtered = await owner.get("/api/site-audits/?status=completed");
  check(
    "B9 상태 필터(사이트 감사) 동작",
    filtered.status === 200 && filtered.body.data.every((row) => row.status === "completed"),
    `count=${filtered.body?.data?.length}`
  );

  /* --------------------------- C. 생성 --------------------------- */
  section("C. 생성 · 입력 검증");
  const created = await owner.post("/api/folders/", {
    name: `검증용 폴더 ${RUN}`,
    domain: `verify-${RUN}.example.com`,
  });
  check(
    "C1 정상 생성은 201",
    created.status === 201 && created.body.data.id && created.body.data.version === 1,
    `status=${created.status}`
  );
  const createdId = created.body?.data?.id;

  const dupDomain = await owner.post("/api/folders/", {
    name: `다른 이름 ${RUN}`,
    domain: `verify-${RUN}.example.com`,
  });
  check(
    "C2 도메인 중복은 409 DUPLICATE + 필드 메시지",
    dupDomain.status === 409 &&
      dupDomain.body?.error?.code === "DUPLICATE" &&
      dupDomain.body?.error?.fields?.domain,
    `status=${dupDomain.status}`
  );

  const badDomain = await owner.post("/api/folders/", {
    name: `잘못된 도메인 ${RUN}`,
    domain: "htp:/// not a domain !!!",
  });
  check(
    "C3 잘못된 도메인은 400 + 원본과 동일한 문구",
    badDomain.status === 400 &&
      badDomain.body?.error?.fields?.domain === "올바른 웹사이트를 입력하세요.",
    JSON.stringify(badDomain.body?.error?.fields)
  );

  const missingName = await owner.post("/api/folders/", { domain: `noname-${RUN}.example.com` });
  check(
    "C4 필수값(비즈니스명) 누락은 400",
    missingName.status === 400 && missingName.body?.error?.fields?.name,
    JSON.stringify(missingName.body?.error?.fields)
  );

  const normalized = await owner.post("/api/folders/", {
    name: `정규화 확인 ${RUN}`,
    domain: `HTTPS://Normalize-${RUN}.Example.COM/path?x=1`,
  });
  check(
    "C5 도메인 정규화(스킴·경로 제거, 소문자)",
    normalized.status === 201 && normalized.body.data.domain === `normalize-${RUN}.example.com`,
    `domain=${normalized.body?.data?.domain}`
  );
  const normalizedId = normalized.body?.data?.id;

  const autoSite = await owner.get(`/api/sites/?folderId=${createdId}`);
  check(
    "C6 폴더 생성 시 대표 도메인이 사이트로 함께 등록",
    autoSite.status === 200 && autoSite.body.data.some((s) => s.isPrimary),
    `count=${autoSite.body?.data?.length}`
  );

  /* --------------------------- D. 수정 --------------------------- */
  section("D. 수정 · 동시 수정 충돌");
  const updated = await owner.patch(`/api/folders/${createdId}/`, {
    name: `검증용 폴더 ${RUN}(수정)`,
    version: 1,
  });
  check(
    "D1 정상 수정은 200이고 version 증가",
    updated.status === 200 && updated.body.data.name === `검증용 폴더 ${RUN}(수정)` && updated.body.data.version === 2,
    `version=${updated.body?.data?.version}`
  );

  const stale = await owner.patch(`/api/folders/${createdId}/`, {
    name: "오래된 버전으로 수정",
    version: 1,
  });
  check(
    "D2 오래된 version 으로 수정하면 409 VERSION_CONFLICT",
    stale.status === 409 && stale.body?.error?.code === "VERSION_CONFLICT",
    `status=${stale.status}`
  );

  const domainChange = await owner.patch(`/api/folders/${createdId}/`, {
    domain: `changed-${RUN}.example.com`,
    version: 2,
  });
  const afterDomainChange = await owner.get(`/api/folders/${createdId}/`);
  check(
    "D3 도메인은 수정 요청을 보내도 변경되지 않음 (원본 규칙 R1)",
    domainChange.status === 200 && afterDomainChange.body.data.domain === `verify-${RUN}.example.com`,
    `domain=${afterDomainChange.body?.data?.domain}`
  );

  const notFound = await owner.patch(`/api/folders/does-not-exist/`, { name: "x" });
  check(
    "D4 존재하지 않는 ID 수정은 404",
    notFound.status === 404 && notFound.body?.error?.code === "NOT_FOUND",
    `status=${notFound.status}`
  );

  /* ------------------- E. 삭제 · 복구 · 영구삭제 ------------------ */
  section("E. 소프트 삭제 · 복구 · 영구 삭제");
  const softDeleted = await owner.delete(`/api/folders/${normalizedId}/`);
  check("E1 소프트 삭제는 200", softDeleted.status === 200 && softDeleted.body.data.deletedAt);

  const activeAfterDelete = await owner.get("/api/folders/");
  check(
    "E2 삭제 후 활성 목록에서 제외",
    !activeAfterDelete.body.data.some((row) => row.id === normalizedId)
  );

  const trashed = await owner.get("/api/folders/?scope=trashed");
  check(
    "E3 휴지통 목록에 포함",
    trashed.body.data.some((row) => row.id === normalizedId),
    `trashCount=${trashed.body?.data?.length}`
  );

  const editTrashed = await owner.patch(`/api/folders/${normalizedId}/`, { name: "휴지통 수정" });
  check(
    "E4 휴지통 항목 수정은 거부",
    editTrashed.status === 400,
    `status=${editTrashed.status}`
  );

  const cascaded = await owner.get(`/api/sites/?folderId=${normalizedId}&scope=trashed`);
  check(
    "E5 하위 사이트도 함께 휴지통으로 이동(연쇄 소프트 삭제)",
    cascaded.status === 200 && cascaded.body.data.length >= 1,
    `count=${cascaded.body?.data?.length}`
  );

  const restored = await owner.post(`/api/folders/${normalizedId}/restore/`);
  check("E6 복구는 200", restored.status === 200);

  const restoredSites = await owner.get(`/api/sites/?folderId=${normalizedId}`);
  check(
    "E7 복구 시 하위 사이트도 함께 복구",
    restoredSites.body.data.length >= 1,
    `count=${restoredSites.body?.data?.length}`
  );

  const purgeNoCode = await owner.delete(`/api/folders/${normalizedId}/?purge=1`);
  check(
    "E8 확인 코드 없는 영구 삭제는 400",
    purgeNoCode.status === 400 && purgeNoCode.body?.error?.fields?.code,
    `status=${purgeNoCode.status}`
  );

  const codeResponse = await owner.post(`/api/folders/${normalizedId}/confirm-code/`);
  const code = codeResponse.body?.data?.code;
  check(
    "E9 확인 코드 발급(6자리)",
    codeResponse.status === 200 && /^\d{6}$/.test(String(code)),
    `code=${code}`
  );

  const wrongCode = await owner.delete(`/api/folders/${normalizedId}/?purge=1&code=000000`);
  check(
    "E10 틀린 코드로 영구 삭제는 400",
    wrongCode.status === 400,
    `status=${wrongCode.status}`
  );

  const purged = await owner.delete(`/api/folders/${normalizedId}/?purge=1&code=${code}`);
  check("E11 올바른 코드로 영구 삭제는 200", purged.status === 200 && purged.body.data.purged);

  const afterPurge = await owner.get(`/api/folders/${normalizedId}/`);
  check("E12 영구 삭제 후 조회는 404", afterPurge.status === 404);

  const reusedCode = await owner.delete(`/api/folders/${createdId}/?purge=1&code=${code}`);
  check(
    "E13 소비된 코드는 재사용 불가",
    reusedCode.status === 400,
    `status=${reusedCode.status}`
  );

  /* --------------------------- F. 일괄 작업 --------------------------- */
  section("F. 일괄 작업");
  const bulkA = await owner.post("/api/content/", { title: `일괄 대상 A ${RUN}` });
  const bulkB = await owner.post("/api/content/", { title: `일괄 대상 B ${RUN}` });
  const bulkIds = [bulkA.body?.data?.id, bulkB.body?.data?.id];

  const bulkDelete = await owner.post("/api/content/bulk/", {
    action: "delete",
    ids: bulkIds,
  });
  check(
    "F1 일괄 삭제 2건 성공",
    bulkDelete.status === 200 && bulkDelete.body.data.succeeded.length === 2,
    JSON.stringify(bulkDelete.body?.data)
  );

  const bulkRestore = await owner.post("/api/content/bulk/", {
    action: "restore",
    ids: bulkIds,
  });
  check(
    "F2 일괄 복구 2건 성공",
    bulkRestore.status === 200 && bulkRestore.body.data.succeeded.length === 2
  );

  const bulkEmpty = await owner.post("/api/content/bulk/", { action: "delete", ids: [] });
  check("F3 빈 대상 일괄 작업은 400", bulkEmpty.status === 400);

  /* ---------------------------- G. 권한 ---------------------------- */
  section("G. 역할 권한 · 소유권 · 테넌트");
  const viewer = createClient();
  await login(viewer, "viewer@example.com");

  const viewerRead = await viewer.get("/api/folders/");
  check("G1 viewer 는 목록 조회 가능", viewerRead.status === 200);

  const viewerCreate = await viewer.post("/api/folders/", {
    name: `viewer 생성 시도 ${RUN}`,
    domain: `viewer-create-${RUN}.example.com`,
  });
  check(
    "G2 viewer 는 생성 불가(403)",
    viewerCreate.status === 403 && viewerCreate.body?.error?.code === "FORBIDDEN",
    `status=${viewerCreate.status}`
  );

  const viewerDelete = await viewer.delete(`/api/folders/${createdId}/`);
  check("G3 viewer 는 삭제 불가(403)", viewerDelete.status === 403);

  const viewerAudit = await viewer.get("/api/audit/");
  check("G4 viewer 는 감사 로그 조회 불가(403)", viewerAudit.status === 403);

  const viewerMembers = await viewer.get("/api/members/");
  check("G5 viewer 는 사용자 관리 불가(403)", viewerMembers.status === 403);

  const editor = createClient();
  await login(editor, "editor@example.com");

  const editorOwnCreate = await editor.post("/api/folders/", {
    name: `editor 소유 폴더 ${RUN}`,
    domain: `editor-own-${RUN}.example.com`,
  });
  check("G6 editor 는 생성 가능(201)", editorOwnCreate.status === 201);
  const editorFolderId = editorOwnCreate.body?.data?.id;

  const editorOtherUpdate = await editor.patch(`/api/folders/${createdId}/`, {
    name: "타인 소유 수정 시도",
  });
  check(
    "G7 editor 는 타인 소유 폴더 수정 불가(403)",
    editorOtherUpdate.status === 403,
    `status=${editorOtherUpdate.status}`
  );

  const editorOwnUpdate = await editor.patch(`/api/folders/${editorFolderId}/`, {
    name: `editor 소유 폴더 ${RUN}(수정)`,
  });
  check("G8 editor 는 본인 소유 폴더 수정 가능(200)", editorOwnUpdate.status === 200);

  await editor.delete(`/api/folders/${editorFolderId}/`);
  const editorPurgeCode = await editor.post(`/api/folders/${editorFolderId}/confirm-code/`);
  check(
    "G9 editor 는 영구 삭제 권한 없음(403)",
    editorPurgeCode.status === 403,
    `status=${editorPurgeCode.status}`
  );

  const admin = createClient();
  await login(admin, "admin@example.com");
  const adminAudit = await admin.get("/api/audit/");
  check(
    "G10 admin 은 감사 로그 조회 가능(200)",
    adminAudit.status === 200 && Array.isArray(adminAudit.body.data),
    `status=${adminAudit.status}`
  );

  const adminMembers = await admin.get("/api/members/");
  check(
    "G11 admin 은 멤버 목록 조회 가능(4명)",
    adminMembers.status === 200 && adminMembers.body.data.members.length === 4,
    `count=${adminMembers.body?.data?.members?.length}`
  );

  /* -------------------------- H. 내보내기 -------------------------- */
  section("H. 내보내기");
  const csv = await owner.get("/api/folders/export/");
  check(
    "H1 CSV 내보내기는 text/csv 로 응답",
    csv.status === 200 && csv.contentType.includes("text/csv") && String(csv.body).includes("name"),
    `type=${csv.contentType}`
  );

  /* -------------------------- I. 감사 로그 -------------------------- */
  section("I. 감사 로그");
  const auditAfter = await admin.get("/api/audit/?pageSize=100");
  const actions = new Set(auditAfter.body.data.map((row) => row.action));
  check(
    "I1 생성·수정·삭제·복구·영구삭제·일괄작업·내보내기가 모두 기록됨",
    ["create", "update", "delete", "restore", "purge", "bulk_delete", "export"].every((a) =>
      actions.has(a)
    ),
    `actions=${Array.from(actions).join(",")}`
  );

  const purgeLog = auditAfter.body.data.find((row) => row.action === "purge");
  check(
    "I2 영구 삭제 기록에 삭제된 대상 이름이 남음",
    purgeLog?.entityLabel === `정규화 확인 ${RUN}`,
    `label=${purgeLog?.entityLabel}`
  );

  const auditWithBefore = auditAfter.body.data.find((row) => row.action === "update" && row.before);
  check(
    "I3 수정 기록에 before/after 스냅샷 저장",
    Boolean(auditWithBefore?.before && auditWithBefore?.after),
    `hasBefore=${Boolean(auditWithBefore?.before)}`
  );

  const userAudit = auditAfter.body.data.find((row) => row.entityType === "users");
  if (userAudit) {
    check(
      "I4 사용자 스냅샷에 비밀번호 해시가 저장되지 않음",
      !JSON.stringify(userAudit).includes("passwordHash") ||
        JSON.stringify(userAudit).includes("[redacted]")
    );
  }

  const activities = await owner.get("/api/activities/");
  check(
    "I5 인증 활동 로그에 login 기록 존재",
    activities.status === 200 && activities.body.data.some((row) => row.eventType === "login"),
    `count=${activities.body?.data?.length}`
  );

  check(
    "I6 활동 로그에는 엔티티 CRUD 가 기록되지 않음 (원본 동작 재현)",
    activities.body.data.every((row) =>
      ["login", "login_failed", "logout", "registration", "password_change"].includes(
        row.eventType
      )
    )
  );

  /* ------------------------- J. 알림 설정 ------------------------- */
  section("J. 알림 설정");
  const notifications = await owner.get("/api/notifications/");
  check(
    "J1 알림 항목 3개와 활성 카운터",
    notifications.status === 200 &&
      notifications.body.data.length === 3 &&
      /\d\/3 활성/.test(notifications.body.meta.summary),
    `summary=${notifications.body?.meta?.summary}`
  );

  const toggled = await owner.patch("/api/notifications/", {
    key: "product_news",
    enabled: false,
  });
  const afterToggle = await owner.get("/api/notifications/");
  check(
    "J2 토글은 즉시 저장(별도 저장 요청 없음)",
    toggled.status === 200 &&
      afterToggle.body.data.find((row) => row.key === "product_news")?.enabled === false
  );

  /* ------------------------ K. 레이트 리밋 ------------------------ */
  section("K. 로그인 레이트 리밋");
  const attacker = createClient();
  let limited = false;
  for (let i = 0; i < 12; i += 1) {
    const response = await login(attacker, "ratelimit-test@example.com", "wrong");
    if (response.status === 429) {
      limited = true;
      break;
    }
  }
  check("K1 반복 로그인 실패 시 429로 차단", limited);

  /* --------------------------- 정리 --------------------------- */
  section("정리");
  const cleanupCode = await owner.post(`/api/folders/${createdId}/confirm-code/`);
  await owner.delete(
    `/api/folders/${createdId}/?purge=1&code=${cleanupCode.body?.data?.code}`
  );
  // 일괄 작업용 문서와 editor 폴더도 영구 삭제해 다음 실행에 영향이 없게 한다.
  for (const id of bulkIds) {
    const codeFor = await owner.post(`/api/content/${id}/confirm-code/`);
    await owner.delete(`/api/content/${id}/?purge=1&code=${codeFor.body?.data?.code}`);
  }
  if (editorFolderId) {
    const editorCode = await owner.post(`/api/folders/${editorFolderId}/confirm-code/`);
    await owner.delete(
      `/api/folders/${editorFolderId}/?purge=1&code=${editorCode.body?.data?.code}`
    );
  }
  const finalList = await owner.get("/api/folders/");
  check(
    "검증용 데이터 정리 후 시드 폴더 4건 유지",
    finalList.body.data.filter((row) => !row.name.includes("검증용")).length >= 4,
    `count=${finalList.body?.data?.length}`
  );

  console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
  if (failures.length > 0) {
    console.log("\n실패 항목:");
    for (const failure of failures) {
      console.log(` - ${failure.name}${failure.detail ? ` (${failure.detail})` : ""}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("검증 스크립트 오류:", error);
  process.exit(1);
});
