import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";

type AuditAction = (typeof auditLogs.$inferInsert)["action"];

const MASKED_KEYS = new Set([
  "password",
  "passwordHash",
  "passwordSalt",
  "tokenHash",
  "token",
  "apiKey",
  "secret",
]);

/** 스냅샷에서 자격증명류 필드를 제거한다. 감사 로그가 새 유출 경로가 되지 않게 한다. */
function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = MASKED_KEYS.has(key) ? "[redacted]" : sanitize(val);
    }
    return out;
  }
  return value;
}

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(sanitize(value));
}

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * 감사 로그 기록. 실패해도 본 작업을 되돌리지 않는다(로그 손실 < 작업 실패).
 * 감사 대상: 모든 생성·수정·삭제·복구·영구삭제·권한거부·로그인.
 */
export function writeAudit(auth: AuthContext | null, input: AuditInput): void {
  try {
    db.insert(auditLogs)
      .values({
        id: newId("aud"),
        workspaceId: auth?.workspaceId ?? null,
        actorUserId: auth?.userId ?? null,
        actorEmail: auth?.email ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel ?? null,
        before: serialize(input.before),
        after: serialize(input.after),
        ip: auth?.ip ?? null,
        userAgent: auth?.userAgent ?? null,
      })
      .run();
  } catch (error) {
    console.error("[audit] failed to write audit log", error);
  }
}

/** 인증 컨텍스트가 없는 이벤트(로그인 실패 등)용. */
export function writeAnonymousAudit(input: {
  action: AuditAction;
  entityType: string;
  entityLabel?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): void {
  try {
    db.insert(auditLogs)
      .values({
        id: newId("aud"),
        workspaceId: null,
        actorUserId: null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        entityType: input.entityType,
        entityLabel: input.entityLabel ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      })
      .run();
  } catch (error) {
    console.error("[audit] failed to write anonymous audit log", error);
  }
}
