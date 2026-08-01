import { and, asc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { aiVisibilityProjects, aiVisibilityRuns } from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import { registerDueJob } from "@/server/providers/scheduler";
import { createAiVisibilityRun, drainAiVisibilityRun } from "./runs";

export const AI_VISIBILITY_DUE_JOB_NAME = "ai_visibility_collect_due";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface ScheduledProject {
  id: string;
  folderId: string;
  domain: string;
  workspaceId: string;
  createdBy: string | null;
  nextRunAt: Date | null;
  runId?: string;
}

function cronAuth(project: ScheduledProject): AuthContext {
  return {
    userId: project.createdBy ?? "system-cron",
    email: "cron@localhost",
    name: "AI 가시성 주간 수집",
    workspaceId: project.workspaceId,
    workspaceName: "",
    workspacePlan: "pro",
    role: "editor",
    sessionId: "cron",
    ip: null,
    userAgent: null,
  };
}

function missingSchema(error: unknown): boolean {
  return error instanceof Error && /no such table|no such column/i.test(error.message);
}

async function listInterrupted(limit: number): Promise<ScheduledProject[]> {
  try {
    return await db
      .select({
        id: aiVisibilityProjects.id,
        folderId: aiVisibilityProjects.folderId,
        domain: aiVisibilityProjects.domain,
        workspaceId: aiVisibilityProjects.workspaceId,
        createdBy: aiVisibilityProjects.createdBy,
        nextRunAt: aiVisibilityProjects.nextRunAt,
        runId: aiVisibilityRuns.id,
      })
      .from(aiVisibilityRuns)
      .innerJoin(aiVisibilityProjects, eq(aiVisibilityProjects.id, aiVisibilityRuns.projectId))
      .where(
        and(
          inArray(aiVisibilityRuns.status, ["queued", "running"]),
          isNull(aiVisibilityProjects.deletedAt),
        ),
      )
      .orderBy(asc(aiVisibilityRuns.updatedAt))
      .limit(limit);
  } catch (error) {
    if (missingSchema(error)) return [];
    throw error;
  }
}

async function listDue(now: Date, limit: number): Promise<ScheduledProject[]> {
  try {
    return await db
      .select({
        id: aiVisibilityProjects.id,
        folderId: aiVisibilityProjects.folderId,
        domain: aiVisibilityProjects.domain,
        workspaceId: aiVisibilityProjects.workspaceId,
        createdBy: aiVisibilityProjects.createdBy,
        nextRunAt: aiVisibilityProjects.nextRunAt,
      })
      .from(aiVisibilityProjects)
      .where(
        and(
          eq(aiVisibilityProjects.status, "active"),
          eq(aiVisibilityProjects.schedule, "weekly"),
          isNull(aiVisibilityProjects.deletedAt),
          isNotNull(aiVisibilityProjects.nextRunAt),
          lte(aiVisibilityProjects.nextRunAt, now),
        ),
      )
      .orderBy(asc(aiVisibilityProjects.nextRunAt))
      .limit(limit);
  } catch (error) {
    if (missingSchema(error)) return [];
    throw error;
  }
}

async function advance(projectId: string, now: Date) {
  await db.update(aiVisibilityProjects).set({
    nextRunAt: new Date(now.getTime() + WEEK_MS),
    updatedAt: now,
  }).where(eq(aiVisibilityProjects.id, projectId));
}

export async function collectDueAiVisibilityProjects(options?: { now?: Date; limit?: number }) {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 10;
  const interrupted = await listInterrupted(limit);
  const due = await listDue(now, limit);
  const recovered = new Set(interrupted.map((row) => row.id));
  const results: { projectId: string; domain: string; ok: boolean; error?: string }[] = [];

  for (const project of interrupted) {
    try {
      const report = await drainAiVisibilityRun(cronAuth(project), project.runId!);
      results.push({
        projectId: project.id,
        domain: project.domain,
        ok: report.status === "completed" || report.status === "partial",
        ...(report.status === "failed" ? { error: report.error ?? "모든 수집 항목이 실패했습니다." } : {}),
      });
    } catch (error) {
      results.push({
        projectId: project.id,
        domain: project.domain,
        ok: false,
        error: error instanceof Error ? error.message : "중단된 실행 복구에 실패했습니다.",
      });
    }
  }

  for (const project of due) {
    if (recovered.has(project.id)) {
      await advance(project.id, now);
      continue;
    }
    try {
      const auth = cronAuth(project);
      const created = await createAiVisibilityRun(auth, project.folderId, "scheduled");
      const report = await drainAiVisibilityRun(auth, created.runId);
      results.push({
        projectId: project.id,
        domain: project.domain,
        ok: report.status === "completed" || report.status === "partial",
        ...(report.status === "failed" ? { error: report.error ?? "모든 수집 항목이 실패했습니다." } : {}),
      });
    } catch (error) {
      results.push({
        projectId: project.id,
        domain: project.domain,
        ok: false,
        error: error instanceof Error ? error.message : "주간 수집에 실패했습니다.",
      });
    } finally {
      await advance(project.id, now);
    }
  }
  return {
    checked: interrupted.length + due.filter((row) => !recovered.has(row.id)).length,
    collected: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
    ranAt: now.toISOString(),
  };
}

let registered = false;

export function registerAiVisibilityDueJob() {
  if (registered) return;
  registerDueJob(AI_VISIBILITY_DUE_JOB_NAME, async ({ now, limit }) => {
    const summary = await collectDueAiVisibilityProjects({ now, limit });
    return {
      scanned: summary.checked,
      processed: summary.collected,
      failed: summary.failed,
      errors: summary.results
        .filter((result) => !result.ok && result.error)
        .map((result) => `${result.domain}: ${result.error}`),
    };
  });
  registered = true;
}
