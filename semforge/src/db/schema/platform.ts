import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * 플랫폼(테넌트/인증/감사) 스키마.
 *
 * 증거 등급: 이 파일의 구조는 원본 SEMForge 서버 구현을 관찰한 것이 아니라
 * 안전한 재구축을 위한 제안(P)이다. UI에서 관찰된 사실은
 * docs/research/APP_CRUD_EVIDENCE.md 에 별도로 기록한다.
 */

/** 밀리초 epoch 정수로 저장하고 표시 시점에 Asia/Seoul 로 변환한다. */
const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

/** 모든 도메인 테이블이 공유하는 감사·소프트삭제·낙관적 잠금 컬럼. */
export const auditColumns = {
  createdAt: timestampMs("created_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: timestampMs("updated_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  /** null 이면 활성. 값이 있으면 휴지통 상태(소프트 삭제). */
  deletedAt: timestampMs("deleted_at"),
  deletedBy: text("deleted_by"),
  /** 동시 수정 충돌 감지용. 수정마다 +1. */
  version: integer("version").notNull().default(1),
};

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** 기능 게이트 판단용 플랜. UI 의 업그레이드 게이트를 재현한다. */
    plan: text("plan", { enum: ["free", "pro", "guru", "business"] })
      .notNull()
      .default("pro"),
    ...auditColumns,
  },
  (t) => [uniqueIndex("workspaces_slug_unique").on(t.slug)]
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    lastLoginAt: timestampMs("last_login_at"),
    ...auditColumns,
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)]
);

/** 사용자-워크스페이스 소속과 역할. 권한 판정의 단일 출처. */
export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["owner", "admin", "editor", "viewer"],
    })
      .notNull()
      .default("viewer"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("memberships_workspace_user_unique").on(t.workspaceId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ]
);

/** 세션 토큰은 원문을 저장하지 않고 SHA-256 해시만 보관한다. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 현재 활성 워크스페이스. 워크스페이스 전환 시 갱신. */
    activeWorkspaceId: text("active_workspace_id").references(
      () => workspaces.id,
      { onDelete: "set null" }
    ),
    expiresAt: timestampMs("expires_at").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    revokedAt: timestampMs("revoked_at"),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ]
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    actorUserId: text("actor_user_id"),
    actorEmail: text("actor_email"),
    action: text("action", {
      enum: [
        "login",
        "login_failed",
        "logout",
        "create",
        "update",
        "delete",
        "restore",
        "purge",
        "bulk_delete",
        "bulk_restore",
        "bulk_update",
        "export",
        "permission_denied",
      ],
    }).notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    /** 삭제 후에도 로그를 읽을 수 있도록 표시용 이름을 비정규화 저장. */
    entityLabel: text("entity_label"),
    /** 변경 전/후 스냅샷(JSON 문자열). 민감 필드는 저장 전에 마스킹. */
    before: text("before"),
    after: text("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestampMs("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("audit_logs_workspace_idx").on(t.workspaceId, t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ]
);

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type MemberRole = Membership["role"];
