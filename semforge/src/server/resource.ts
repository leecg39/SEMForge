import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { ZodType } from "zod";
import { db } from "@/db/client";
import { deleteConfirmations } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { likePattern, listMeta, parseListQuery, type ListQuery } from "@/lib/list-query";
import { assertCan, assertOwnershipOrAdmin, hasRole } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";

/**
 * 모든 도메인 리소스가 공유하는 CRUD 실행기.
 *
 * 여기에 정책을 한 번만 구현해서 리소스별 라우트가 규칙을 우회할 수 없게 만든다.
 * - 테넌트 분리: 모든 질의에 workspace_id 조건을 강제
 * - 소프트 삭제: deleted_at IS NULL 인 행만 활성으로 취급
 * - 낙관적 잠금: version 불일치 시 409
 * - 감사 로그: 생성·수정·삭제·복구·영구삭제·일괄작업 전부 기록
 */

type Columns = Record<string, SQLiteColumn>;

export interface UniqueRule {
  /** 활성 행 기준으로 유일해야 하는 컬럼 조합 */
  fields: string[];
  message: string;
}

export interface ResourceConfig {
  /** URL·감사 로그에 쓰는 식별자 (예: "folders") */
  key: string;
  /** 사용자에게 보여줄 이름 (예: "폴더") */
  label: string;
  table: SQLiteTable;
  /** 표시명으로 쓸 컬럼 (감사 로그 entityLabel) */
  labelField: string;
  searchFields: string[];
  sortableFields: string[];
  defaultSort: string;
  filterableFields?: string[];
  createSchema: ZodType;
  updateSchema: ZodType;
  uniqueRules?: UniqueRule[];
  /** 목록 기본 정렬 앞에 붙는 고정 정렬 (예: 핀 고정 우선) */
  primaryOrder?: (cols: Columns) => SQL[];
  /** 소유권 등 리소스 고유 필터 */
  extraWhere?: (auth: AuthContext, query: ListQuery, cols: Columns) => SQL | undefined;
  /** 생성 직후 파생 데이터 삽입 등 */
  afterCreate?: (auth: AuthContext, row: Record<string, unknown>) => Promise<void>;
  /** 파일 저장소 등 DB 외부 자산을 영구 삭제 전에 정리한다. */
  beforePurge?: (auth: AuthContext, row: Record<string, unknown>) => Promise<void>;
  /** 소프트 삭제·복구 시 함께 처리할 하위 테이블 */
  cascade?: { table: SQLiteTable; foreignKey: string }[];
}

function columnsOf(table: SQLiteTable): Columns {
  return table as unknown as Columns;
}

function requireColumn(cols: Columns, name: string, resource: string): SQLiteColumn {
  const col = cols[name];
  if (!col) {
    throw new ApiError("INTERNAL", `${resource} 리소스에 ${name} 컬럼이 없습니다.`);
  }
  return col;
}

function baseWhere(
  cfg: ResourceConfig,
  auth: AuthContext,
  scope: "active" | "trashed" | "all"
): SQL[] {
  const cols = columnsOf(cfg.table);
  const conds: SQL[] = [
    eq(requireColumn(cols, "workspaceId", cfg.key), auth.workspaceId),
  ];
  const deletedAt = cols.deletedAt;
  if (deletedAt) {
    if (scope === "active") conds.push(isNull(deletedAt));
    else if (scope === "trashed") conds.push(isNotNull(deletedAt));
  }
  return conds;
}

/** 활성 행 기준 중복 검사. DB 유일 인덱스와 이중으로 걸어 필드별 메시지를 제공한다. */
async function assertUnique(
  cfg: ResourceConfig,
  auth: AuthContext,
  values: Record<string, unknown>,
  excludeId?: string
): Promise<void> {
  if (!cfg.uniqueRules?.length) return;
  const cols = columnsOf(cfg.table);
  for (const rule of cfg.uniqueRules) {
    const relevant = rule.fields.filter((f) => values[f] !== undefined);
    if (relevant.length !== rule.fields.length) continue;

    const conds = baseWhere(cfg, auth, "active");
    for (const field of rule.fields) {
      conds.push(eq(requireColumn(cols, field, cfg.key), values[field] as never));
    }
    if (excludeId) {
      conds.push(ne(requireColumn(cols, "id", cfg.key), excludeId));
    }
    const [existing] = await db
      .select({ id: requireColumn(cols, "id", cfg.key) })
      .from(cfg.table)
      .where(and(...conds))
      .limit(1);
    if (existing) {
      const field = rule.fields[rule.fields.length - 1];
      throw new ApiError("DUPLICATE", rule.message, {
        fields: { [field]: rule.message },
      });
    }
  }
}

export async function listResource(
  cfg: ResourceConfig,
  auth: AuthContext,
  request: Request
) {
  assertCan(auth, "read");
  const cols = columnsOf(cfg.table);
  const query = parseListQuery(request, {
    sortableFields: cfg.sortableFields,
    defaultSort: cfg.defaultSort,
    filterableFields: cfg.filterableFields,
  });

  const conds = baseWhere(cfg, auth, query.scope);

  if (query.q && cfg.searchFields.length > 0) {
    const pattern = likePattern(query.q);
    const searches = cfg.searchFields.map((f) =>
      like(requireColumn(cols, f, cfg.key), pattern)
    );
    const combined = searches.length === 1 ? searches[0] : or(...searches);
    if (combined) conds.push(combined);
  }

  for (const [field, values] of Object.entries(query.filters)) {
    if (!cfg.sortableFields.includes(field) && !cfg.filterableFields?.includes(field)) {
      continue;
    }
    const col = cols[field];
    if (!col) continue;
    conds.push(inArray(col, values));
  }

  const extra = cfg.extraWhere?.(auth, query, cols);
  if (extra) conds.push(extra);

  const where = and(...conds);
  const sortCol = requireColumn(cols, query.sortField, cfg.key);
  const orderBy = [
    ...(cfg.primaryOrder?.(cols) ?? []),
    query.sortDir === "asc" ? asc(sortCol) : desc(sortCol),
  ];

  const rows = await db
    .select()
    .from(cfg.table)
    .where(where)
    .orderBy(...orderBy)
    .limit(query.pageSize)
    .offset(query.offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(cfg.table)
    .where(where);

  return { data: rows, meta: listMeta(query, Number(total)) };
}

export async function getResource(
  cfg: ResourceConfig,
  auth: AuthContext,
  id: string
): Promise<Record<string, unknown>> {
  assertCan(auth, "read");
  const cols = columnsOf(cfg.table);
  const conds = baseWhere(cfg, auth, "all");
  conds.push(eq(requireColumn(cols, "id", cfg.key), id));
  const [row] = await db.select().from(cfg.table).where(and(...conds)).limit(1);
  if (!row) {
    // 타 워크스페이스 리소스와 존재하지 않는 리소스를 동일하게 404 로 응답한다.
    throw new ApiError("NOT_FOUND", `${cfg.label}을(를) 찾을 수 없습니다.`);
  }
  return row as Record<string, unknown>;
}

export async function createResource(
  cfg: ResourceConfig,
  auth: AuthContext,
  input: unknown
) {
  assertCan(auth, "create");
  const parsed = cfg.createSchema.parse(input) as Record<string, unknown>;
  await assertUnique(cfg, auth, parsed);

  const now = new Date();
  const values = {
    ...parsed,
    id: newId(),
    workspaceId: auth.workspaceId,
    createdAt: now,
    updatedAt: now,
    createdBy: auth.userId,
    updatedBy: auth.userId,
    version: 1,
  };

  const [row] = await db
    .insert(cfg.table)
    .values(values as never)
    .returning();

  const record = row as Record<string, unknown>;
  await cfg.afterCreate?.(auth, record);

  writeAudit(auth, {
    action: "create",
    entityType: cfg.key,
    entityId: String(record.id),
    entityLabel: String(record[cfg.labelField] ?? ""),
    after: record,
  });

  return record;
}

export async function updateResource(
  cfg: ResourceConfig,
  auth: AuthContext,
  id: string,
  input: unknown
) {
  assertCan(auth, "update");
  const before = await getResource(cfg, auth, id);
  assertOwnershipOrAdmin(auth, before as { createdBy?: string | null });

  if (before.deletedAt) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `휴지통에 있는 ${cfg.label}은(는) 수정할 수 없습니다. 먼저 복구하세요.`
    );
  }

  const parsed = cfg.updateSchema.parse(input) as Record<string, unknown>;
  const { version: expectedVersion, ...patch } = parsed;

  if (
    expectedVersion !== undefined &&
    Number(expectedVersion) !== Number(before.version)
  ) {
    throw new ApiError(
      "VERSION_CONFLICT",
      "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.",
      { details: { currentVersion: before.version, current: before } }
    );
  }

  await assertUnique(cfg, auth, patch, id);

  const cols = columnsOf(cfg.table);
  const [row] = await db
    .update(cfg.table)
    .set({
      ...patch,
      updatedAt: new Date(),
      updatedBy: auth.userId,
      version: Number(before.version) + 1,
    } as never)
    .where(
      and(
        eq(requireColumn(cols, "id", cfg.key), id),
        eq(requireColumn(cols, "version", cfg.key), Number(before.version))
      )
    )
    .returning();

  if (!row) {
    // version 조건이 빗나갔다면 그 사이 다른 요청이 먼저 커밋된 것이다.
    throw new ApiError(
      "VERSION_CONFLICT",
      "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요."
    );
  }

  const record = row as Record<string, unknown>;
  writeAudit(auth, {
    action: "update",
    entityType: cfg.key,
    entityId: id,
    entityLabel: String(record[cfg.labelField] ?? ""),
    before,
    after: record,
  });
  return record;
}

async function cascadeSoftDelete(
  cfg: ResourceConfig,
  parentId: string,
  deletedAt: Date | null,
  userId: string | null
) {
  for (const child of cfg.cascade ?? []) {
    const cols = columnsOf(child.table);
    const fk = cols[child.foreignKey];
    if (!fk || !cols.deletedAt) continue;
    await db
      .update(child.table)
      .set({ deletedAt, deletedBy: deletedAt ? userId : null } as never)
      .where(eq(fk, parentId));
  }
}

export async function softDeleteResource(
  cfg: ResourceConfig,
  auth: AuthContext,
  id: string
) {
  assertCan(auth, "delete");
  const before = await getResource(cfg, auth, id);
  assertOwnershipOrAdmin(auth, before as { createdBy?: string | null });
  if (before.deletedAt) {
    throw new ApiError("VALIDATION_ERROR", `이미 휴지통에 있는 ${cfg.label}입니다.`);
  }

  const cols = columnsOf(cfg.table);
  const now = new Date();
  await db
    .update(cfg.table)
    .set({ deletedAt: now, deletedBy: auth.userId, updatedAt: now } as never)
    .where(eq(requireColumn(cols, "id", cfg.key), id));
  await cascadeSoftDelete(cfg, id, now, auth.userId);

  writeAudit(auth, {
    action: "delete",
    entityType: cfg.key,
    entityId: id,
    entityLabel: String(before[cfg.labelField] ?? ""),
    before,
  });
  return { id, deletedAt: now };
}

export async function restoreResource(
  cfg: ResourceConfig,
  auth: AuthContext,
  id: string
) {
  assertCan(auth, "restore");
  const before = await getResource(cfg, auth, id);
  assertOwnershipOrAdmin(auth, before as { createdBy?: string | null });
  if (!before.deletedAt) {
    throw new ApiError("VALIDATION_ERROR", `휴지통에 없는 ${cfg.label}입니다.`);
  }

  // 삭제 기간 중 같은 이름/도메인이 새로 만들어졌을 수 있으므로 복구 전에 다시 검사한다.
  await assertUnique(cfg, auth, before, id);

  const cols = columnsOf(cfg.table);
  await db
    .update(cfg.table)
    .set({ deletedAt: null, deletedBy: null, updatedAt: new Date() } as never)
    .where(eq(requireColumn(cols, "id", cfg.key), id));
  await cascadeSoftDelete(cfg, id, null, null);

  writeAudit(auth, {
    action: "restore",
    entityType: cfg.key,
    entityId: id,
    entityLabel: String(before[cfg.labelField] ?? ""),
    after: { ...before, deletedAt: null },
  });
  return { id, restored: true };
}

/**
 * 영구 삭제 확인 코드 발급.
 * 원본 Semrush 폴더 삭제가 매번 새 6자리 코드를 요구하는 UX(O)를 서버 발급으로 재현한다.
 */
export async function issueDeleteCode(
  cfg: ResourceConfig,
  auth: AuthContext,
  id: string
) {
  assertCan(auth, "purge");
  const row = await getResource(cfg, auth, id);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db.insert(deleteConfirmations).values({
    id: newId("dcf"),
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    entityType: cfg.key,
    entityId: id,
    code,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  return { code, label: String(row[cfg.labelField] ?? ""), expiresInSeconds: 300 };
}

export async function purgeResource(
  cfg: ResourceConfig,
  auth: AuthContext,
  id: string,
  code: string | null
) {
  assertCan(auth, "purge");
  if (!hasRole(auth.role, "admin")) {
    throw new ApiError("FORBIDDEN", "영구 삭제는 관리자 이상만 가능합니다.");
  }
  const before = await getResource(cfg, auth, id);

  if (!code) {
    throw new ApiError("VALIDATION_ERROR", "확인 코드를 입력하세요.", {
      fields: { code: "확인 코드를 입력하세요." },
    });
  }
  const [confirmation] = await db
    .select()
    .from(deleteConfirmations)
    .where(
      and(
        eq(deleteConfirmations.entityType, cfg.key),
        eq(deleteConfirmations.entityId, id),
        eq(deleteConfirmations.userId, auth.userId),
        eq(deleteConfirmations.code, code),
        isNull(deleteConfirmations.consumedAt)
      )
    )
    .limit(1);

  if (!confirmation || confirmation.expiresAt.getTime() < Date.now()) {
    throw new ApiError("VALIDATION_ERROR", "확인 코드가 일치하지 않습니다.", {
      fields: { code: "확인 코드가 일치하지 않습니다." },
    });
  }

  await db
    .update(deleteConfirmations)
    .set({ consumedAt: new Date() })
    .where(eq(deleteConfirmations.id, confirmation.id));

  const cols = columnsOf(cfg.table);
  await cfg.beforePurge?.(auth, before);
  await db.delete(cfg.table).where(eq(requireColumn(cols, "id", cfg.key), id));

  writeAudit(auth, {
    action: "purge",
    entityType: cfg.key,
    entityId: id,
    entityLabel: String(before[cfg.labelField] ?? ""),
    before,
  });
  return { id, purged: true };
}

export type BulkAction = "delete" | "restore";

export async function bulkResource(
  cfg: ResourceConfig,
  auth: AuthContext,
  action: BulkAction,
  ids: string[]
) {
  assertCan(auth, "bulk");
  if (ids.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "대상을 하나 이상 선택하세요.");
  }
  if (ids.length > 100) {
    throw new ApiError("VALIDATION_ERROR", "한 번에 100건까지 처리할 수 있습니다.");
  }

  const succeeded: string[] = [];
  const failed: { id: string; message: string }[] = [];
  for (const id of ids) {
    try {
      if (action === "delete") await softDeleteResource(cfg, auth, id);
      else await restoreResource(cfg, auth, id);
      succeeded.push(id);
    } catch (error) {
      failed.push({
        id,
        message: error instanceof ApiError ? error.message : "처리하지 못했습니다.",
      });
    }
  }

  writeAudit(auth, {
    action: action === "delete" ? "bulk_delete" : "bulk_restore",
    entityType: cfg.key,
    entityLabel: `${succeeded.length}건`,
    after: { succeeded, failed },
  });

  return { succeeded, failed };
}
