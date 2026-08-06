import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  backlinkAuditLinks,
  backlinkDisavowEntries,
  backlinkDisavowExports,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import { getBacklinkAuditProject } from "@/server/backlink-audit/service";
import { normalizeBacklinkPageUrl } from "@/server/backlinks/target";

function normalizeDomain(value: string): string {
  const candidate = value.trim().toLowerCase().replace(/^domain:/u, "").replace(/\.$/u, "");
  if (!candidate || candidate.length > 253 || candidate.includes("/") || candidate.includes(":")) {
    throw new ApiError("VALIDATION_ERROR", "거부할 도메인을 확인해 주세요.", { fields: { value: "예: spam.example.com" } });
  }
  const labels = candidate.split(".");
  if (labels.length < 2 || labels.some((label) => !/^(?!-)[a-z0-9-]{1,63}(?<!-)$/iu.test(label))) {
    throw new ApiError("VALIDATION_ERROR", "거부할 도메인을 확인해 주세요.", { fields: { value: "예: spam.example.com" } });
  }
  return candidate;
}

function normalizeValue(kind: "url" | "domain", value: string): string {
  return kind === "domain" ? normalizeDomain(value) : normalizeBacklinkPageUrl(value);
}

export async function listDisavowEntries(auth: AuthContext, projectId: string) {
  await getBacklinkAuditProject(auth, projectId);
  const rows = await db.select().from(backlinkDisavowEntries)
    .where(eq(backlinkDisavowEntries.projectId, projectId))
    .orderBy(asc(backlinkDisavowEntries.kind), asc(backlinkDisavowEntries.value));
  return rows.map((row) => ({
    id: row.id,
    linkId: row.linkId,
    kind: row.kind,
    value: row.value,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function addDisavowEntry(auth: AuthContext, projectId: string, input: {
  linkId?: string | null;
  kind: "url" | "domain";
  value: string;
  reason?: string | null;
}) {
  await getBacklinkAuditProject(auth, projectId);
  const linkId: string | null = input.linkId ?? null;
  if (linkId) {
    const [link] = await db.select().from(backlinkAuditLinks).where(and(
      eq(backlinkAuditLinks.id, linkId), eq(backlinkAuditLinks.projectId, projectId),
    )).limit(1);
    if (!link) throw new ApiError("NOT_FOUND", "백링크를 찾을 수 없습니다.");
  }
  const value = normalizeValue(input.kind, input.value);
  const [row] = await db.insert(backlinkDisavowEntries).values({
    id: newId("bde"), workspaceId: auth.workspaceId, projectId, linkId,
    kind: input.kind, value, reason: input.reason ?? null, createdBy: auth.userId, createdAt: new Date(),
  }).onConflictDoUpdate({
    target: [backlinkDisavowEntries.projectId, backlinkDisavowEntries.kind, backlinkDisavowEntries.value],
    set: { linkId, reason: input.reason ?? null },
  }).returning();
  if (linkId) {
    await db.update(backlinkAuditLinks).set({ reviewStatus: "disavow", updatedAt: new Date() })
      .where(eq(backlinkAuditLinks.id, linkId));
  }
  return { id: row.id, kind: row.kind, value: row.value };
}

export async function deleteDisavowEntry(auth: AuthContext, projectId: string, id: string) {
  await getBacklinkAuditProject(auth, projectId);
  const [row] = await db.delete(backlinkDisavowEntries).where(and(
    eq(backlinkDisavowEntries.id, id), eq(backlinkDisavowEntries.projectId, projectId),
  )).returning();
  if (!row) throw new ApiError("NOT_FOUND", "거부 목록 항목을 찾을 수 없습니다.");
  return { deleted: true };
}

export async function buildDisavowPreview(auth: AuthContext, projectId: string) {
  const project = await getBacklinkAuditProject(auth, projectId);
  const entries = await listDisavowEntries(auth, projectId);
  const lines = entries.map((entry) => entry.kind === "domain" ? `domain:${entry.value}` : entry.value);
  const content = [
    `# SEMForge backlink audit export for ${project.siteUrl}`,
    `# Generated ${new Date().toISOString()}`,
    "# Review every entry before uploading to Google Search Console.",
    ...lines,
    "",
  ].join("\n");
  if (Buffer.byteLength(content, "utf8") > 2 * 1024 * 1024 || lines.length > 100_000) {
    throw new ApiError("PLAN_LIMIT", "Google 거부 파일의 2MB 또는 100,000행 제한을 초과했습니다.");
  }
  return {
    projectId,
    siteUrl: project.siteUrl,
    entryCount: entries.length,
    content,
    warnings: [
      "거부 파일은 링크를 삭제하지 않으며 Google의 링크 평가에서 제외하도록 요청합니다.",
      "잘못 사용하면 검색 성능에 악영향을 줄 수 있으므로 수동 검토 후 업로드하세요.",
      "Google에 새 파일을 올리면 해당 속성의 기존 목록이 교체됩니다.",
    ],
  };
}

export async function recordDisavowExport(auth: AuthContext, projectId: string) {
  const preview = await buildDisavowPreview(auth, projectId);
  await db.insert(backlinkDisavowExports).values({
    id: newId("bdx"),
    workspaceId: auth.workspaceId,
    projectId,
    entryCount: preview.entryCount,
    contentSha256: createHash("sha256").update(preview.content).digest("hex"),
    exportedBy: auth.userId,
    createdAt: new Date(),
  });
  return preview;
}
