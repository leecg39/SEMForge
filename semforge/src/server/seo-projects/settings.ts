import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { folders, seoProjectSettings } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { assertCan, assertOwnershipOrAdmin } from "@/lib/rbac";
import {
  DEFAULT_SEO_PROJECT_SETTINGS,
  parseStoredHiddenWidgets,
  type SeoProjectSettingsPatch,
  type SeoProjectSettingsValue,
} from "@/lib/seo-project-settings";
import type { AuthContext } from "@/lib/session";

export interface SeoProjectSettingsResult extends SeoProjectSettingsValue {
  projectId: string;
  projectName: string;
  domain: string;
  updatedAt: string | null;
}

async function getProject(auth: AuthContext, projectId: string) {
  const [project] = await db
    .select({
      id: folders.id,
      name: folders.name,
      domain: folders.domain,
      createdBy: folders.createdBy,
    })
    .from(folders)
    .where(
      and(
        eq(folders.id, projectId),
        eq(folders.workspaceId, auth.workspaceId),
        isNull(folders.deletedAt),
      ),
    )
    .limit(1);

  if (!project) {
    throw new ApiError("NOT_FOUND", "SEO 프로젝트를 찾을 수 없습니다.");
  }
  return project;
}

function toResult(
  project: { id: string; name: string; domain: string },
  row?: typeof seoProjectSettings.$inferSelect,
): SeoProjectSettingsResult {
  return {
    projectId: project.id,
    projectName: project.name,
    domain: project.domain,
    countryCode: row?.countryCode ?? DEFAULT_SEO_PROJECT_SETTINGS.countryCode,
    device: row?.device ?? DEFAULT_SEO_PROJECT_SETTINGS.device,
    searchEngine: row?.searchEngine ?? DEFAULT_SEO_PROJECT_SETTINGS.searchEngine,
    resultScope: row?.resultScope ?? DEFAULT_SEO_PROJECT_SETTINGS.resultScope,
    hiddenWidgets: row
      ? parseStoredHiddenWidgets(row.hiddenWidgets)
      : DEFAULT_SEO_PROJECT_SETTINGS.hiddenWidgets,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function getSeoProjectSettings(
  auth: AuthContext,
  projectId: string,
): Promise<SeoProjectSettingsResult> {
  assertCan(auth, "read");
  const project = await getProject(auth, projectId);
  const [row] = await db
    .select()
    .from(seoProjectSettings)
    .where(
      and(
        eq(seoProjectSettings.folderId, projectId),
        eq(seoProjectSettings.workspaceId, auth.workspaceId),
      ),
    )
    .limit(1);
  return toResult(project, row);
}

export async function updateSeoProjectSettings(
  auth: AuthContext,
  projectId: string,
  patch: SeoProjectSettingsPatch,
): Promise<SeoProjectSettingsResult> {
  assertCan(auth, "update");
  const project = await getProject(auth, projectId);
  assertOwnershipOrAdmin(auth, project);
  const before = await getSeoProjectSettings(auth, projectId);
  const next: SeoProjectSettingsValue = { ...before, ...patch };
  const now = new Date();

  await db
    .insert(seoProjectSettings)
    .values({
      id: newId("seops"),
      workspaceId: auth.workspaceId,
      folderId: projectId,
      countryCode: next.countryCode,
      device: next.device,
      searchEngine: next.searchEngine,
      resultScope: next.resultScope,
      hiddenWidgets: JSON.stringify(next.hiddenWidgets),
      updatedAt: now,
      updatedBy: auth.userId,
    })
    .onConflictDoUpdate({
      target: seoProjectSettings.folderId,
      set: {
        countryCode: next.countryCode,
        device: next.device,
        searchEngine: next.searchEngine,
        resultScope: next.resultScope,
        hiddenWidgets: JSON.stringify(next.hiddenWidgets),
        updatedAt: now,
        updatedBy: auth.userId,
      },
    });

  const after = await getSeoProjectSettings(auth, projectId);
  writeAudit(auth, {
    action: "update",
    entityType: "seo-project-settings",
    entityId: projectId,
    entityLabel: project.name,
    before,
    after,
  });
  return after;
}
