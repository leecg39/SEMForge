// @TASK P2-A1-T1 - PostgreSQL auth store transaction contracts
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterEach, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";

import type { SemforgeDatabase } from "@/db/client";
import * as schema from "@/db/schema";
import {
  PostgresAuthStore,
  PostgresOperatorInviteStore,
} from "@/server/auth/postgres-store";
import { currentLegalDocuments } from "@/server/privacy/legal-documents";

const databases: PGlite[] = [];
const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** raw label은 테스트 가독성에만 쓰고 DB에는 실제 SHA-256 lower-hex만 전달한다. */
function digest(rawLabel: string): string {
  return createHash("sha256").update(rawLabel, "utf8").digest("hex");
}

function testNow(): Date {
  const now = new Date();
  now.setMilliseconds(0);
  return now;
}

function addMs(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

async function createStores(): Promise<{
  auth: PostgresAuthStore;
  operator: PostgresOperatorInviteStore;
  database: SemforgeDatabase;
}> {
  const client = new PGlite();
  databases.push(client);
  await client.waitReady;
  const database = drizzle(client, { schema });
  await migrate(database, {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  const semforgeDatabase = database as unknown as SemforgeDatabase;
  return {
    auth: new PostgresAuthStore(semforgeDatabase),
    operator: new PostgresOperatorInviteStore(semforgeDatabase),
    database: semforgeDatabase,
  };
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

test("새 workspace 초대 수락은 사용자·membership·session·초대 소비를 원자 생성한다", async () => {
  const { auth: store, operator } = await createStores();
  const now = testNow();

  const invite = await operator.createInvite({
    workspaceName: "Agency One",
    workspaceSlug: "agency-one",
    email: "  OWNER@Example.COM ",
    tokenHash: digest("invite-hash-1"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const result = await store.acceptInviteAtomic({
    tokenHash: digest("invite-hash-1"),
    email: "owner@example.com",
    user: {
      kind: "new",
      passwordHash: "scrypt:test-password-hash",
      displayName: "Owner",
    },
    sessionTokenHash: digest("session-hash-1"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });

  assert.equal(invite.email, "owner@example.com");
  assert.equal(invite.acceptedWorkspaceId, null);
  assert.equal(result.status, "accepted");
  if (result.status !== "accepted") return;
  assert.notEqual(result.principal.workspaceId, null);
  assert.equal(
    (await store.listMembershipsForUser(result.principal.userId))[0]?.workspaceName,
    "Agency One",
  );
  assert.equal(result.principal.email, "owner@example.com");
  assert.equal(result.principal.role, "owner");

  const session = await store.findSessionByTokenHash(digest("session-hash-1"), now);
  assert.deepEqual(session, result.principal);

  const reused = await store.acceptInviteAtomic({
    tokenHash: digest("invite-hash-1"),
    email: "owner@example.com",
    user: {
      kind: "new",
      passwordHash: "scrypt:different-password-hash",
      displayName: "Attacker",
    },
    sessionTokenHash: digest("session-hash-2"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(reused.status, "invalid");
  assert.equal(await store.findSessionByTokenHash(digest("session-hash-2"), now), null);
});

test("초대 수락은 final 약관·개인정보 version/SHA와 presented/accepted 시각을 같은 transaction에 기록한다", async () => {
  const { auth: store, operator, database } = await createStores();
  const now = testNow();
  const presentedAt = addMs(now, -MINUTE_MS);
  const documents = currentLegalDocuments();
  await operator.createInvite({
    workspaceName: "Consent Agency",
    workspaceSlug: "consent-agency",
    email: "consent@example.com",
    tokenHash: digest("consent-invite-hash"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });

  const result = await store.acceptInviteAtomic({
    tokenHash: digest("consent-invite-hash"),
    email: "consent@example.com",
    user: {
      kind: "new",
      passwordHash: "scrypt:test-password-hash",
      displayName: "Consent Owner",
    },
    sessionTokenHash: digest("consent-session-hash"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
    legalAcceptance: {
      termsVersion: documents.terms.version,
      termsSha256: documents.terms.sha256,
      privacyVersion: documents.privacy.version,
      privacySha256: documents.privacy.sha256,
      presentedAt,
    },
  });
  assert.equal(result.status, "accepted");
  if (result.status !== "accepted") return;

  const rows = await database.execute<{
    workspace_id: string;
    user_id: string;
    terms_version: string;
    terms_sha256: string;
    privacy_version: string;
    privacy_sha256: string;
    presented_at: Date;
    accepted_at: Date;
  }>(
    `select workspace_id::text, user_id::text, terms_version, terms_sha256,
            privacy_version, privacy_sha256, presented_at, accepted_at
       from legal_acceptances
      where workspace_id = '${result.principal.workspaceId}'`,
  );
  assert.equal(rows.rows.length, 1);
  assert.deepEqual(rows.rows[0], {
    workspace_id: result.principal.workspaceId,
    user_id: result.principal.userId,
    terms_version: documents.terms.version,
    terms_sha256: documents.terms.sha256,
    privacy_version: documents.privacy.version,
    privacy_sha256: documents.privacy.sha256,
    presented_at: presentedAt.toISOString().replace("T", " ").replace(".000Z", "+00"),
    accepted_at: now.toISOString().replace("T", " ").replace(".000Z", "+00"),
  });
});

test("invite preflight은 유효한 token과 일치 email만 ready로 공개하고 나머지는 invalid로 합친다", async () => {
  const { auth: store, operator } = await createStores();
  const now = testNow();
  await operator.createInvite({
    workspaceName: "Preflight Agency",
    workspaceSlug: "preflight-agency",
    email: "owner@example.com",
    tokenHash: digest("preflight-invite-hash"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });

  const findUserByEmail = store.findUserByEmail.bind(store);
  let userLookupCount = 0;
  store.findUserByEmail = async (email) => {
    userLookupCount += 1;
    return findUserByEmail(email);
  };

  assert.deepEqual(
    await store.prepareInviteAcceptance({
      tokenHash: digest("unknown-preflight-token"),
      email: "owner@example.com",
      now,
    }),
    { status: "invalid" },
  );
  assert.equal(userLookupCount, 0);

  assert.deepEqual(
    await store.prepareInviteAcceptance({
      tokenHash: digest("preflight-invite-hash"),
      email: " OWNER@example.com ",
      now,
    }),
    { status: "ready", user: null },
  );
  assert.equal(userLookupCount, 1);
  assert.deepEqual(
    await store.prepareInviteAcceptance({
      tokenHash: digest("preflight-invite-hash"),
      email: "other@example.com",
      now,
    }),
    { status: "invalid" },
  );
  assert.deepEqual(
    await store.prepareInviteAcceptance({
      tokenHash: digest("preflight-invite-hash"),
      email: "owner@example.com",
      now: addMs(now, 7 * DAY_MS),
    }),
    { status: "invalid" },
  );
});

test("유효한 pending invite와 email 또는 workspace slug가 겹치면 재발급을 거부한다", async () => {
  const { operator } = await createStores();
  const now = testNow();
  await operator.createInvite({
    workspaceName: "Unique Agency",
    workspaceSlug: "unique-agency",
    email: "unique@example.com",
    tokenHash: digest("unique-first-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });

  await assert.rejects(() => operator.createInvite({
    workspaceName: "Different Agency",
    workspaceSlug: "different-agency",
    email: "UNIQUE@example.com",
    tokenHash: digest("unique-duplicate-email"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  }));
  await assert.rejects(() => operator.createInvite({
    workspaceName: "Same Slug Agency",
    workspaceSlug: "unique-agency",
    email: "different@example.com",
    tokenHash: digest("unique-duplicate-slug"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  }));
});

test("operator store는 직접 호출에서도 email·workspace name·slug 계약을 검증한다", async () => {
  const { operator } = await createStores();
  const now = testNow();
  const valid = {
    workspaceName: "Validated Agency",
    workspaceSlug: "validated-agency",
    email: "validated@example.com",
    tokenHash: digest("validated-invite"),
    role: "owner" as const,
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  };

  await assert.rejects(
    operator.createInvite({ ...valid, email: "invalid-email" }),
    /유효한 초대 이메일/u,
  );
  await assert.rejects(
    operator.createInvite({ ...valid, workspaceName: "x".repeat(101) }),
    /workspace name/u,
  );
  await assert.rejects(
    operator.createInvite({ ...valid, workspaceSlug: "Invalid_Slug" }),
    /workspace slug/u,
  );
});

test("만료된 pending invite는 DB clock으로 supersede한 뒤 재발급하고 이전 token을 거부한다", async () => {
  const { auth: store, operator, database } = await createStores();
  const now = testNow();
  await database.insert(schema.invites).values({
    workspaceName: "Expired Agency",
    workspaceSlug: "EXPIRED-AGENCY",
    email: "expired@example.com",
    tokenHash: digest("expired-old-invite"),
    role: "owner",
    createdAt: addMs(now, -2 * DAY_MS),
    expiresAt: addMs(now, -DAY_MS),
  });

  await operator.createInvite({
    workspaceName: "Expired Agency Reissued",
    workspaceSlug: "expired-agency",
    email: "EXPIRED@example.com",
    tokenHash: digest("expired-new-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });

  assert.deepEqual(
    await store.prepareInviteAcceptance({
      tokenHash: digest("expired-old-invite"),
      email: "expired@example.com",
      now,
    }),
    { status: "invalid" },
  );
  assert.deepEqual(
    await store.prepareInviteAcceptance({
      tokenHash: digest("expired-new-invite"),
      email: "expired@example.com",
      now,
    }),
    { status: "ready", user: null },
  );
});

test("동시에 같은 초대를 수락해도 한 요청만 성공하고 session도 하나만 남는다", async () => {
  const { auth: store, operator } = await createStores();
  const now = testNow();
  await operator.createInvite({
    workspaceName: "Concurrent Agency",
    workspaceSlug: "concurrent-agency",
    email: "owner@example.com",
    tokenHash: digest("concurrent-invite-hash"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });

  const accept = (sessionTokenLabel: string) => store.acceptInviteAtomic({
    tokenHash: digest("concurrent-invite-hash"),
    email: "owner@example.com",
    user: { kind: "new", passwordHash: "scrypt:concurrent", displayName: "Owner" },
    sessionTokenHash: digest(sessionTokenLabel),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  const results = await Promise.all([
    accept("concurrent-session-a"),
    accept("concurrent-session-b"),
  ]);

  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ["accepted", "invalid"],
  );
  const sessions = await Promise.all([
    store.findSessionByTokenHash(digest("concurrent-session-a"), now),
    store.findSessionByTokenHash(digest("concurrent-session-b"), now),
  ]);
  assert.equal(sessions.filter(Boolean).length, 1);
});

test("workspace slug 충돌로 수락 CAS가 실패하면 먼저 만든 user도 rollback되어 orphan이 남지 않는다", async () => {
  const { auth: store, operator } = await createStores();
  const now = testNow();
  await operator.createInvite({
    workspaceName: "First Slug Owner",
    workspaceSlug: "shared-slug",
    email: "first@example.com",
    tokenHash: digest("shared-slug-first-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const first = await store.acceptInviteAtomic({
    tokenHash: digest("shared-slug-first-invite"),
    email: "first@example.com",
    user: { kind: "new", passwordHash: "scrypt:first" },
    sessionTokenHash: digest("shared-slug-first-session"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(first.status, "accepted");

  await operator.createInvite({
    workspaceName: "Conflicting Slug Owner",
    workspaceSlug: "shared-slug",
    email: "orphan@example.com",
    tokenHash: digest("shared-slug-second-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const conflicted = await store.acceptInviteAtomic({
    tokenHash: digest("shared-slug-second-invite"),
    email: "orphan@example.com",
    user: { kind: "new", passwordHash: "scrypt:must-rollback" },
    sessionTokenHash: digest("shared-slug-second-session"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });

  assert.deepEqual(conflicted, { status: "invalid" });
  assert.equal(await store.findUserByEmail("orphan@example.com"), null);
  assert.deepEqual(
    await store.prepareInviteAcceptance({
      tokenHash: digest("shared-slug-second-invite"),
      email: "orphan@example.com",
      now,
    }),
    { status: "ready", user: null },
  );
});

test("기존 사용자는 password hash를 CAS 재확인하고 새 workspace owner가 되어도 기존 password를 보존한다", async () => {
  const { auth: store, operator } = await createStores();
  const now = testNow();
  await operator.createInvite({
    workspaceName: "Existing User Agency",
    workspaceSlug: "existing-user-agency",
    email: "member@example.com",
    tokenHash: digest("existing-user-first-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const firstAcceptance = await store.acceptInviteAtomic({
    tokenHash: digest("existing-user-first-invite"),
    email: "member@example.com",
    user: { kind: "new", passwordHash: "scrypt:original", displayName: "Member" },
    sessionTokenHash: digest("existing-user-first-session"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(firstAcceptance.status, "accepted");
  if (firstAcceptance.status !== "accepted") return;

  await operator.createInvite({
    workspaceName: "Existing User Second Agency",
    workspaceSlug: "existing-user-second-agency",
    email: "member@example.com",
    tokenHash: digest("existing-user-second-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const preflight = await store.prepareInviteAcceptance({
    tokenHash: digest("existing-user-second-invite"),
    email: "MEMBER@example.com",
    now,
  });
  assert.equal(preflight.status, "ready");
  if (preflight.status !== "ready" || !preflight.user) return;

  const invalid = await store.acceptInviteAtomic({
    tokenHash: digest("existing-user-second-invite"),
    email: "member@example.com",
    user: {
      kind: "existing",
      userId: preflight.user.id,
      expectedPasswordHash: "scrypt:stale-or-invalid",
    },
    sessionTokenHash: digest("existing-user-invalid-session"),
    currentSessionTokenHash: digest("existing-user-first-session"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(invalid.status, "invalid");
  assert.deepEqual(
    await store.findSessionByTokenHash(digest("existing-user-first-session"), now),
    firstAcceptance.principal,
  );

  const accepted = await store.acceptInviteAtomic({
    tokenHash: digest("existing-user-second-invite"),
    email: "member@example.com",
    user: {
      kind: "existing",
      userId: preflight.user.id,
      expectedPasswordHash: "scrypt:original",
    },
    sessionTokenHash: digest("existing-user-second-session"),
    currentSessionTokenHash: digest("existing-user-first-session"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(accepted.status, "accepted");
  if (accepted.status !== "accepted") return;
  assert.equal(accepted.principal.role, "owner");
  assert.equal((await store.findUserById(preflight.user.id))?.passwordHash, "scrypt:original");
  assert.equal(
    await store.findSessionByTokenHash(digest("existing-user-first-session"), now),
    null,
  );
  assert.deepEqual(
    await store.findSessionByTokenHash(digest("existing-user-second-session"), now),
    accepted.principal,
  );
});

test("초대 수락 session 교체는 다른 사용자의 cookie hash를 revoke하지 않는다", async () => {
  const { auth: store, operator } = await createStores();
  const now = testNow();

  await operator.createInvite({
    workspaceName: "Accept Session A",
    workspaceSlug: "accept-session-a",
    email: "accept-a@example.com",
    tokenHash: digest("accept-session-a-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const userA = await store.acceptInviteAtomic({
    tokenHash: digest("accept-session-a-invite"),
    email: "accept-a@example.com",
    user: { kind: "new", passwordHash: "scrypt:accept-a" },
    sessionTokenHash: digest("accept-session-a-old"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  await operator.createInvite({
    workspaceName: "Accept Session B",
    workspaceSlug: "accept-session-b",
    email: "accept-b@example.com",
    tokenHash: digest("accept-session-b-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const userB = await store.acceptInviteAtomic({
    tokenHash: digest("accept-session-b-invite"),
    email: "accept-b@example.com",
    user: { kind: "new", passwordHash: "scrypt:accept-b" },
    sessionTokenHash: digest("accept-session-b-current"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(userA.status, "accepted");
  assert.equal(userB.status, "accepted");
  if (userA.status !== "accepted" || userB.status !== "accepted") return;

  await operator.createInvite({
    workspaceName: "Accept Session A Second",
    workspaceSlug: "accept-session-a-second",
    email: "accept-a@example.com",
    tokenHash: digest("accept-session-a-second-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const accepted = await store.acceptInviteAtomic({
    tokenHash: digest("accept-session-a-second-invite"),
    email: "accept-a@example.com",
    user: {
      kind: "existing",
      userId: userA.principal.userId,
      expectedPasswordHash: "scrypt:accept-a",
    },
    sessionTokenHash: digest("accept-session-a-new"),
    currentSessionTokenHash: digest("accept-session-b-current"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });

  assert.equal(accepted.status, "accepted");
  assert.deepEqual(
    await store.findSessionByTokenHash(digest("accept-session-b-current"), now),
    userB.principal,
  );
  assert.deepEqual(
    await store.findSessionByTokenHash(digest("accept-session-a-old"), now),
    userA.principal,
  );
});

test("session rotation은 새 hash 생성과 현재 session revoke를 한 transaction으로 처리한다", async () => {
  const { auth: store, operator } = await createStores();
  const now = testNow();
  await operator.createInvite({
    workspaceName: "Rotation Agency",
    workspaceSlug: "rotation-agency",
    email: "owner@example.com",
    tokenHash: digest("rotation-invite-hash"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const accepted = await store.acceptInviteAtomic({
    tokenHash: digest("rotation-invite-hash"),
    email: "owner@example.com",
    user: { kind: "new", passwordHash: "scrypt:rotation", displayName: "Owner" },
    sessionTokenHash: digest("old-session-hash"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(accepted.status, "accepted");
  if (accepted.status !== "accepted") return;

  const rotated = await store.rotateSession({
    userId: accepted.principal.userId,
    workspaceId: accepted.principal.workspaceId,
    currentTokenHash: digest("old-session-hash"),
    newTokenHash: digest("new-session-hash"),
    expiresAt: addMs(now, 31 * DAY_MS),
    now: addMs(now, DAY_MS),
  });

  assert.equal(await store.findSessionByTokenHash(digest("old-session-hash"), now), null);
  assert.deepEqual(
    await store.findSessionByTokenHash(digest("new-session-hash"), now),
    rotated,
  );
});

test("session rotation은 다른 사용자나 workspace의 current token을 revoke하지 않는다", async () => {
  const { auth: store, operator } = await createStores();
  const now = testNow();

  await operator.createInvite({
    workspaceName: "Rotation A",
    workspaceSlug: "rotation-a",
    email: "a@example.com",
    tokenHash: digest("rotation-a-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const userA = await store.acceptInviteAtomic({
    tokenHash: digest("rotation-a-invite"),
    email: "a@example.com",
    user: { kind: "new", passwordHash: "scrypt:a" },
    sessionTokenHash: digest("rotation-a-session"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  await operator.createInvite({
    workspaceName: "Rotation B",
    workspaceSlug: "rotation-b",
    email: "b@example.com",
    tokenHash: digest("rotation-b-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const userB = await store.acceptInviteAtomic({
    tokenHash: digest("rotation-b-invite"),
    email: "b@example.com",
    user: { kind: "new", passwordHash: "scrypt:b" },
    sessionTokenHash: digest("rotation-b-session"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(userA.status, "accepted");
  assert.equal(userB.status, "accepted");
  if (userA.status !== "accepted" || userB.status !== "accepted") return;

  await store.rotateSession({
    userId: userA.principal.userId,
    workspaceId: userA.principal.workspaceId,
    currentTokenHash: digest("rotation-b-session"),
    newTokenHash: digest("rotation-a-new-session"),
    expiresAt: addMs(now, 31 * DAY_MS),
    now: addMs(now, DAY_MS),
  });

  assert.deepEqual(
    await store.findSessionByTokenHash(digest("rotation-b-session"), now),
    userB.principal,
  );
});

test("password reset은 token을 한 번만 소비하고 password 변경과 모든 session revoke를 원자 처리한다", async () => {
  const { auth: store, operator } = await createStores();
  const now = testNow();
  await operator.createInvite({
    workspaceName: "Reset Agency",
    workspaceSlug: "reset-agency",
    email: "reset@example.com",
    tokenHash: digest("reset-invite-hash"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const accepted = await store.acceptInviteAtomic({
    tokenHash: digest("reset-invite-hash"),
    email: "reset@example.com",
    user: { kind: "new", passwordHash: "scrypt:old", displayName: "Reset Owner" },
    sessionTokenHash: digest("reset-session-one"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(accepted.status, "accepted");
  if (accepted.status !== "accepted") return;
  await store.rotateSession({
    userId: accepted.principal.userId,
    workspaceId: accepted.principal.workspaceId,
    newTokenHash: digest("reset-session-two"),
    expiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  await store.createPasswordReset({
    userId: accepted.principal.userId,
    tokenHash: digest("password-reset-hash"),
    expiresAt: addMs(now, HOUR_MS),
    now,
  });

  const result = await store.resetPasswordAtomic({
    tokenHash: digest("password-reset-hash"),
    passwordHash: "scrypt:new",
    now: addMs(now, 30 * MINUTE_MS),
  });

  assert.deepEqual(result, { status: "reset", userId: accepted.principal.userId });
  assert.equal((await store.findUserById(accepted.principal.userId))?.passwordHash, "scrypt:new");
  assert.equal(await store.findSessionByTokenHash(digest("reset-session-one"), now), null);
  assert.equal(await store.findSessionByTokenHash(digest("reset-session-two"), now), null);
  assert.equal(
    (await store.resetPasswordAtomic({
      tokenHash: digest("password-reset-hash"),
      passwordHash: "scrypt:attacker",
      now: addMs(now, 31 * MINUTE_MS),
    })).status,
    "invalid",
  );
});

test("password reset 생성은 reset token row와 이메일 outbox를 같은 auth transaction에 예약한다", async () => {
  const { auth: store, operator, database } = await createStores();
  const now = testNow();
  await operator.createInvite({
    workspaceName: "Reset Outbox Agency",
    workspaceSlug: "reset-outbox-agency",
    email: "reset-outbox@example.com",
    tokenHash: digest("reset-outbox-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const accepted = await store.acceptInviteAtomic({
    tokenHash: digest("reset-outbox-invite"),
    email: "reset-outbox@example.com",
    user: { kind: "new", passwordHash: "scrypt:old", displayName: "Reset Outbox" },
    sessionTokenHash: digest("reset-outbox-session"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(accepted.status, "accepted");
  if (accepted.status !== "accepted") return;

  const reset = await store.createPasswordReset({
    userId: accepted.principal.userId,
    tokenHash: digest("reset-outbox-token"),
    expiresAt: addMs(now, HOUR_MS),
    now,
    delivery: {
      email: "reset-outbox@example.com",
      resetUrl: "https://app.semforge.test/reset-password/raw-reset-token",
      expiresAt: addMs(now, HOUR_MS),
    },
  });

  const rows = await database
    .select()
    .from(schema.outbox)
    .where(eq(schema.outbox.idempotencyKey, `password-reset:${reset.id}`));
  assert.equal(rows.length, 1);
  const outbox = rows[0]!;
  assert.equal(outbox.workspaceId, accepted.principal.workspaceId);
  assert.equal(outbox.topic, "email.password_reset");
  assert.equal(outbox.publishedAt, null);
  assert.deepEqual(outbox.payload, {
    kind: "password_reset",
    email: "reset-outbox@example.com",
    resetUrl: "https://app.semforge.test/reset-password/raw-reset-token",
    expiresAt: addMs(now, HOUR_MS).toISOString(),
  });
});

test("동시 password reset은 한 요청만 password를 변경하고 다른 요청은 invalid로 끝난다", async () => {
  const { auth: store, operator } = await createStores();
  const now = testNow();
  await operator.createInvite({
    workspaceName: "Concurrent Reset Agency",
    workspaceSlug: "concurrent-reset-agency",
    email: "concurrent-reset@example.com",
    tokenHash: digest("concurrent-reset-invite"),
    role: "owner",
    expiresAt: addMs(now, 7 * DAY_MS),
    now,
  });
  const accepted = await store.acceptInviteAtomic({
    tokenHash: digest("concurrent-reset-invite"),
    email: "concurrent-reset@example.com",
    user: { kind: "new", passwordHash: "scrypt:old" },
    sessionTokenHash: digest("concurrent-reset-session"),
    sessionExpiresAt: addMs(now, 30 * DAY_MS),
    now,
  });
  assert.equal(accepted.status, "accepted");
  if (accepted.status !== "accepted") return;
  await store.createPasswordReset({
    userId: accepted.principal.userId,
    tokenHash: digest("concurrent-password-reset"),
    expiresAt: addMs(now, HOUR_MS),
    now,
  });

  const passwordHashes = ["scrypt:winner-a", "scrypt:winner-b"] as const;
  const results = await Promise.all(passwordHashes.map((passwordHash) =>
    store.resetPasswordAtomic({
      tokenHash: digest("concurrent-password-reset"),
      passwordHash,
      now: addMs(now, MINUTE_MS),
    })));
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ["invalid", "reset"],
  );
  const winnerIndex = results.findIndex((result) => result.status === "reset");
  assert.equal(
    (await store.findUserById(accepted.principal.userId))?.passwordHash,
    passwordHashes[winnerIndex],
  );
});

test("auth throttle은 hash 식별자만 원자 집계하고 5회 이후 15분 동안 차단한다", async () => {
  const { auth: store } = await createStores();
  const now = testNow();
  const keyHash = "a".repeat(64);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const decision = await store.consumeAuthThrottle({
      action: "login",
      keyHash,
      now,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.remaining, 5 - attempt);
  }

  const blocked = await store.consumeAuthThrottle({ action: "login", keyHash, now });
  assert.deepEqual(blocked, {
    allowed: false,
    remaining: 0,
    blockedUntil: addMs(now, 15 * MINUTE_MS),
    retryAfterSeconds: 900,
  });

  await store.clearAuthThrottle("login", keyHash);
  assert.equal(
    (await store.consumeAuthThrottle({ action: "login", keyHash, now })).allowed,
    true,
  );

  const concurrentKeyHash = "b".repeat(64);
  const concurrent = await Promise.all(Array.from({ length: 6 }, () =>
    store.consumeAuthThrottle({ action: "login", keyHash: concurrentKeyHash, now })));
  assert.equal(concurrent.filter((decision) => decision.allowed).length, 5);
  assert.equal(concurrent.filter((decision) => !decision.allowed).length, 1);
});
