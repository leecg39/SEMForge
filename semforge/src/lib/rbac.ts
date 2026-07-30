import { ApiError } from "@/lib/api";
import type { MemberRole } from "@/db/schema";
import type { AuthContext } from "@/lib/session";

/**
 * 역할 기반 권한 판정.
 *
 * 원본 UI 에서 확인되지 않은 서버 정책은 안전한 기본값(P)으로 정한다.
 * - 프론트엔드에서 버튼을 숨기는 것과 별개로 모든 변경 API 는 이 모듈을 통과한다.
 * - 영구 삭제(purge)는 admin 이상으로 제한한다.
 */

const ROLE_RANK: Record<MemberRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export type Capability =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "purge"
  | "bulk"
  | "manageMembers"
  | "viewAudit"
  | "export";

/** 각 권한의 최소 역할. */
const MIN_ROLE: Record<Capability, MemberRole> = {
  read: "viewer",
  export: "viewer",
  create: "editor",
  update: "editor",
  delete: "editor",
  bulk: "editor",
  restore: "editor",
  purge: "admin",
  manageMembers: "admin",
  viewAudit: "admin",
};

export function hasRole(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function can(role: MemberRole, capability: Capability): boolean {
  return hasRole(role, MIN_ROLE[capability]);
}

export function assertCan(auth: AuthContext, capability: Capability): void {
  if (!can(auth.role, capability)) {
    throw new ApiError(
      "FORBIDDEN",
      `이 작업을 수행할 권한이 없습니다. (필요 역할: ${MIN_ROLE[capability]} 이상, 현재: ${auth.role})`
    );
  }
}

/**
 * 레코드 소유권 검사.
 * editor 는 자신이 만든 레코드만, admin 이상은 워크스페이스의 모든 레코드를 변경할 수 있다.
 */
export function assertOwnershipOrAdmin(
  auth: AuthContext,
  record: { createdBy?: string | null }
): void {
  if (hasRole(auth.role, "admin")) return;
  if (record.createdBy && record.createdBy === auth.userId) return;
  throw new ApiError(
    "FORBIDDEN",
    "다른 사용자가 만든 항목은 관리자만 변경할 수 있습니다."
  );
}

/** 테넌트 분리: 다른 워크스페이스의 레코드는 존재 자체를 노출하지 않는다. */
export function assertSameWorkspace(
  auth: AuthContext,
  record: { workspaceId: string } | undefined | null,
  entityLabel: string
): void {
  if (!record || record.workspaceId !== auth.workspaceId) {
    throw new ApiError("NOT_FOUND", `${entityLabel}을(를) 찾을 수 없습니다.`);
  }
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "소유자",
  admin: "관리자",
  editor: "편집자",
  viewer: "조회자",
};
