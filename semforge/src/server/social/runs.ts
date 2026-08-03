import { and, asc, desc, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  socialConnections,
  socialCompetitors,
  socialContentSnapshots,
  socialMediaAssets,
  socialMetricSnapshots,
  socialPostTargets,
  socialPostTags,
  socialPosts,
  socialProfiles,
  socialProjects,
  socialRuns,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import type { SocialRunView } from "@/types/social";
import { SocialProviderError } from "./contracts";
import {
  readSocialMediaAsset,
  saveSocialImage,
  signedSocialMediaUrl,
} from "./media";
import { getDecryptedSocialProfileToken } from "./meta-oauth";
import { ensureSocialProject, requireOwnedSocialFolder } from "./projects";
import { socialProvider } from "./providers";

const MAX_ATTEMPTS = 5;
const SYNC_DEDUP_MS = 10 * 60 * 1000;
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STALE_WORK_MS = 5 * 60 * 1000;

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function runView(run: typeof socialRuns.$inferSelect): SocialRunView {
  return {
    id: run.id,
    kind: run.kind,
    status: run.status,
    total: run.totalCount,
    succeeded: run.succeededCount,
    failed: run.failedCount,
    error: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

function appendUtm(linkUrl: string | null, raw: string): string | null {
  if (!linkUrl) return null;
  let values: Record<string, unknown> = {};
  try {
    values = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return linkUrl;
  }
  const url = new URL(linkUrl);
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith("utm_") || typeof value !== "string" || !value.trim())
      continue;
    url.searchParams.set(key, value.trim());
  }
  return url.toString();
}

function assertProfilePublishCapability(
  profile: typeof socialProfiles.$inferSelect,
  hasImage: boolean,
) {
  let capabilities: {
    publishText?: boolean;
    publishImage?: boolean;
    reason?: string | null;
  } = {};
  try {
    capabilities = JSON.parse(profile.capabilities) as typeof capabilities;
  } catch {
    /* 환경 capability에서 다시 차단한다 */
  }
  const available = hasImage
    ? capabilities.publishImage
    : capabilities.publishText;
  if (available === false)
    throw new SocialProviderError(
      capabilities.reason ||
        "이 프로필은 선택한 게시 형식을 발행할 권한이 없습니다.",
      "unsupported",
      false,
    );
  const runtime = socialProvider(profile.platform).capabilities();
  if (hasImage ? !runtime.publishImage : !runtime.publishText)
    throw new SocialProviderError(
      runtime.reason || "현재 환경에서 실제 게시가 비활성화되어 있습니다.",
      "unsupported",
      false,
    );
}

function retryAt(attempt: number, now = new Date()) {
  return new Date(
    now.getTime() + Math.min(60, 2 ** Math.max(0, attempt - 1)) * 60_000,
  );
}

function zonedParts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

export function nextWeeklyOccurrence(date: Date, timeZone: string) {
  const local = zonedParts(date, timeZone);
  const target = new Date(
    Date.UTC(
      local.year,
      local.month - 1,
      local.day + 7,
      local.hour,
      local.minute,
      local.second,
    ),
  );
  const targetMs = target.getTime();
  let guessMs = targetMs;
  for (let index = 0; index < 3; index += 1) {
    const displayed = zonedParts(new Date(guessMs), timeZone);
    const displayedMs = Date.UTC(
      displayed.year,
      displayed.month - 1,
      displayed.day,
      displayed.hour,
      displayed.minute,
      displayed.second,
    );
    guessMs += targetMs - displayedMs;
  }
  return new Date(guessMs);
}

async function scheduleNextOccurrence(
  auth: AuthContext,
  post: typeof socialPosts.$inferSelect,
  asset: typeof socialMediaAssets.$inferSelect | undefined,
  timeZone: string,
) {
  if (post.publishMode !== "recurring" || !post.scheduledAt) return;
  const next = nextWeeklyOccurrence(post.scheduledAt, timeZone);
  if (post.recurrenceEndAt && next > post.recurrenceEndAt) {
    await db
      .update(socialPosts)
      .set({ nextOccurrenceAt: null, updatedAt: new Date() })
      .where(eq(socialPosts.id, post.id));
    return;
  }
  const rootId = post.recurrenceParentId ?? post.id;
  const idempotencyKey = `${rootId}:${next.toISOString()}`;
  const [existing] = await db
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.projectId, post.projectId),
        eq(socialPosts.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return;
  const nextId = newId("spt");
  const [targets, tags] = await Promise.all([
    db
      .select()
      .from(socialPostTargets)
      .where(eq(socialPostTargets.postId, post.id)),
    db.select().from(socialPostTags).where(eq(socialPostTags.postId, post.id)),
  ]);
  db.transaction((tx) => {
    tx.insert(socialPosts)
      .values({
        id: nextId,
        projectId: post.projectId,
        text: post.text,
        linkUrl: post.linkUrl,
        utm: post.utm,
        status: "queued",
        publishMode: "recurring",
        scheduledAt: next,
        recurrence: post.recurrence,
        recurrenceParentId: rootId,
        recurrenceEndAt: post.recurrenceEndAt,
        nextOccurrenceAt: nextWeeklyOccurrence(next, timeZone),
        submittedAt: new Date(),
        approvedAt: new Date(),
        approvedBy: post.approvedBy,
        idempotencyKey,
        createdBy: post.createdBy,
        updatedBy: post.updatedBy,
      })
      .run();
    for (const target of targets)
      tx.insert(socialPostTargets)
        .values({
          id: newId("stg"),
          postId: nextId,
          profileId: target.profileId,
          status: "queued",
          nextAttemptAt: next,
          createdBy: post.createdBy,
          updatedBy: post.updatedBy,
        })
        .run();
    for (const tag of tags)
      tx.insert(socialPostTags)
        .values({ postId: nextId, tagId: tag.tagId })
        .run();
    tx.update(socialPosts)
      .set({ nextOccurrenceAt: next, updatedAt: new Date() })
      .where(eq(socialPosts.id, post.id))
      .run();
  });
  if (asset) {
    const { bytes } = await readSocialMediaAsset(asset.id);
    const cloned = await saveSocialImage(auth, {
      projectId: post.projectId,
      bytes,
      altText: asset.altText,
    });
    await db
      .update(socialMediaAssets)
      .set({ postId: nextId, updatedAt: new Date(), updatedBy: auth.userId })
      .where(eq(socialMediaAssets.id, cloned.id));
  }
}

async function createRun(
  projectId: string,
  kind: "publish" | "sync",
  trigger: "manual" | "scheduled" | "recovery",
  actor: string,
  total: number,
) {
  if (kind === "sync") {
    const [active] = await db
      .select()
      .from(socialRuns)
      .where(
        and(
          eq(socialRuns.projectId, projectId),
          eq(socialRuns.kind, kind),
          inArray(socialRuns.status, ["queued", "running"]),
          isNull(socialRuns.deletedAt),
        ),
      )
      .limit(1);
    if (active) return active;
  }
  const [created] = await db
    .insert(socialRuns)
    .values({
      id: newId("sor"),
      projectId,
      kind,
      trigger,
      status: "queued",
      totalCount: total,
      createdBy: actor,
      updatedBy: actor,
    })
    .returning();
  return created;
}

async function markReconnect(
  profile: typeof socialProfiles.$inferSelect,
  message: string,
) {
  const now = new Date();
  await db
    .update(socialProfiles)
    .set({ lastError: message, updatedAt: now })
    .where(eq(socialProfiles.id, profile.id));
  if (profile.connectionId) {
    await db
      .update(socialConnections)
      .set({ status: "reconnect_required", lastError: message, updatedAt: now })
      .where(eq(socialConnections.id, profile.connectionId));
  }
}

export async function publishSocialPost(
  auth: AuthContext,
  postId: string,
  trigger: "manual" | "scheduled" | "recovery" = "scheduled",
) {
  const [scope] = await db
    .select({ post: socialPosts, project: socialProjects })
    .from(socialPosts)
    .innerJoin(socialProjects, eq(socialProjects.id, socialPosts.projectId))
    .where(
      and(
        eq(socialPosts.id, postId),
        eq(socialProjects.workspaceId, auth.workspaceId),
        isNull(socialPosts.deletedAt),
      ),
    )
    .limit(1);
  if (!scope)
    throw new ApiError("NOT_FOUND", "소셜 게시물을 찾을 수 없습니다.");
  const now = new Date();
  const staleAt = new Date(now.getTime() - STALE_WORK_MS);
  const [claimedPost] = await db
    .update(socialPosts)
    .set({ status: "publishing", updatedAt: now })
    .where(
      and(
        eq(socialPosts.id, postId),
        or(
          inArray(socialPosts.status, ["queued", "partial", "failed"]),
          and(
            eq(socialPosts.status, "publishing"),
            lte(socialPosts.updatedAt, staleAt),
          ),
        ),
      ),
    )
    .returning({ id: socialPosts.id });
  if (!claimedPost) {
    throw new ApiError(
      "VERSION_CONFLICT",
      scope.post.status === "publishing"
        ? "이미 다른 작업에서 이 게시물을 발행하고 있습니다."
        : "발행 대기 또는 실패 상태의 게시물만 처리할 수 있습니다.",
    );
  }
  const targets = await db
    .select({ target: socialPostTargets, profile: socialProfiles })
    .from(socialPostTargets)
    .innerJoin(
      socialProfiles,
      eq(socialProfiles.id, socialPostTargets.profileId),
    )
    .where(
      and(
        eq(socialPostTargets.postId, postId),
        inArray(socialPostTargets.status, ["queued", "publishing", "failed"]),
      ),
    )
    .orderBy(asc(socialPostTargets.createdAt));
  const retryableTargets = targets.filter(
    ({ target }) =>
      !target.externalPostId && target.attemptCount < MAX_ATTEMPTS,
  );
  const run = await createRun(
    scope.project.id,
    "publish",
    trigger,
    auth.userId,
    retryableTargets.length,
  );
  const [asset] = await db
    .select()
    .from(socialMediaAssets)
    .where(
      and(
        eq(socialMediaAssets.postId, postId),
        isNull(socialMediaAssets.deletedAt),
      ),
    )
    .limit(1);
  const imageUrl = asset ? signedSocialMediaUrl(asset.id) : null;
  await db
    .update(socialRuns)
    .set({ status: "running", startedAt: run.startedAt ?? now, updatedAt: now })
    .where(eq(socialRuns.id, run.id));
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const { target, profile } of retryableTargets) {
    if (target.nextAttemptAt && target.nextAttemptAt > now) continue;
    await db
      .update(socialPostTargets)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(eq(socialPostTargets.id, target.id));
    try {
      assertProfilePublishCapability(profile, Boolean(asset));
      const token = await getDecryptedSocialProfileToken(profile);
      const result = await socialProvider(profile.platform).publish({
        auth,
        platform: profile.platform,
        externalId: profile.externalId,
        parentExternalId: profile.parentExternalId,
        accessToken: token,
        text: scope.post.text,
        linkUrl: appendUtm(scope.post.linkUrl, scope.post.utm),
        publicImageUrl: imageUrl,
        idempotencyKey: `${scope.post.idempotencyKey}:${profile.id}`,
      });
      await db
        .update(socialPostTargets)
        .set({
          status: "published",
          externalPostId: result.externalPostId,
          externalUrl: result.externalUrl,
          publishedAt: result.publishedAt,
          nextAttemptAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(socialPostTargets.id, target.id));
      succeeded += 1;
    } catch (error) {
      const providerError =
        error instanceof SocialProviderError
          ? error
          : new SocialProviderError(
              "소셜 게시 중 알 수 없는 오류가 발생했습니다.",
              "provider_error",
              false,
            );
      const attempt = target.attemptCount + 1;
      const retry = providerError.retryable && attempt < MAX_ATTEMPTS;
      await db
        .update(socialPostTargets)
        .set({
          status: retry ? "queued" : "failed",
          attemptCount: attempt,
          nextAttemptAt: retry ? retryAt(attempt) : null,
          lastError: providerError.message,
          updatedAt: new Date(),
        })
        .where(eq(socialPostTargets.id, target.id));
      if (providerError.code === "reconnect_required")
        await markReconnect(profile, providerError.message);
      if (!retry) failed += 1;
      errors.push(`${profile.displayName}: ${providerError.message}`);
    }
  }

  const finalTargets = await db
    .select()
    .from(socialPostTargets)
    .where(eq(socialPostTargets.postId, postId));
  const published = finalTargets.filter(
    (row) => row.status === "published",
  ).length;
  const terminalFailed = finalTargets.filter(
    (row) => row.status === "failed",
  ).length;
  const stillQueued = finalTargets.some(
    (row) => row.status === "queued" || row.status === "publishing",
  );
  const status = stillQueued
    ? "queued"
    : published === finalTargets.length
      ? "published"
      : published > 0
        ? "partial"
        : "failed";
  const completedAt = stillQueued ? null : new Date();
  await db
    .update(socialPosts)
    .set({
      status,
      publishedAt: published > 0 ? new Date() : null,
      lastError: errors.length ? errors.join("\n") : null,
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, postId));
  await db
    .update(socialRuns)
    .set({
      status: stillQueued
        ? "running"
        : terminalFailed > 0 && published > 0
          ? "partial"
          : terminalFailed > 0
            ? "failed"
            : "completed",
      succeededCount: published,
      failedCount: terminalFailed,
      errorMessage: errors.length ? errors.join("\n") : null,
      completedAt,
      updatedAt: new Date(),
    })
    .where(eq(socialRuns.id, run.id));
  if (!stillQueued && published > 0)
    await scheduleNextOccurrence(
      auth,
      scope.post,
      asset,
      scope.project.timezone,
    );
  return {
    runId: run.id,
    postId,
    status,
    succeeded: succeeded || published,
    failed: failed || terminalFailed,
    errors,
  };
}

export async function enqueueSocialSync(
  auth: AuthContext,
  folderId: string,
  trigger: "manual" | "scheduled" | "recovery" = "manual",
) {
  await requireOwnedSocialFolder(auth, folderId);
  const project = await ensureSocialProject(auth, folderId);
  const [recent] = await db
    .select()
    .from(socialRuns)
    .where(
      and(
        eq(socialRuns.projectId, project.id),
        eq(socialRuns.kind, "sync"),
        inArray(socialRuns.status, [
          "queued",
          "running",
          "completed",
          "partial",
        ]),
        isNull(socialRuns.deletedAt),
      ),
    )
    .orderBy(desc(socialRuns.createdAt))
    .limit(1);
  if (
    trigger === "manual" &&
    recent &&
    recent.createdAt.getTime() > Date.now() - SYNC_DEDUP_MS
  )
    return runView(recent);
  const profiles = await db
    .select()
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.projectId, project.id),
        eq(socialProfiles.enabled, true),
        isNull(socialProfiles.deletedAt),
      ),
    );
  const run = await createRun(
    project.id,
    "sync",
    trigger,
    auth.userId,
    profiles.length,
  );
  return runView(run);
}

export async function executeSocialSync(auth: AuthContext, runId: string) {
  const [scope] = await db
    .select({ run: socialRuns, project: socialProjects })
    .from(socialRuns)
    .innerJoin(socialProjects, eq(socialProjects.id, socialRuns.projectId))
    .where(
      and(
        eq(socialRuns.id, runId),
        eq(socialRuns.kind, "sync"),
        eq(socialProjects.workspaceId, auth.workspaceId),
        isNull(socialRuns.deletedAt),
        isNull(socialProjects.deletedAt),
      ),
    )
    .limit(1);
  if (!scope)
    throw new ApiError("NOT_FOUND", "소셜 동기화 실행을 찾을 수 없습니다.");
  if (
    new Set(["completed", "partial", "failed", "cancelled"]).has(
      scope.run.status,
    )
  )
    return runView(scope.run);
  const now = new Date();
  const staleAt = new Date(now.getTime() - STALE_WORK_MS);
  const [claimedRun] = await db
    .update(socialRuns)
    .set({
      status: "running",
      startedAt: scope.run.startedAt ?? now,
      updatedAt: now,
    })
    .where(
      and(
        eq(socialRuns.id, scope.run.id),
        or(
          eq(socialRuns.status, "queued"),
          and(
            eq(socialRuns.status, "running"),
            lte(socialRuns.updatedAt, staleAt),
          ),
        ),
      ),
    )
    .returning();
  if (!claimedRun) {
    const [current] = await db
      .select()
      .from(socialRuns)
      .where(eq(socialRuns.id, scope.run.id))
      .limit(1);
    if (current) return runView(current);
    throw new ApiError("NOT_FOUND", "소셜 동기화 실행을 찾을 수 없습니다.");
  }
  const run = claimedRun;
  const project = scope.project;
  const profiles = await db
    .select()
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.projectId, project.id),
        eq(socialProfiles.enabled, true),
        isNull(socialProfiles.deletedAt),
      ),
    );
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const profile of profiles) {
    try {
      const token = await getDecryptedSocialProfileToken(profile);
      const adapter = socialProvider(profile.platform);
      const [metric, posts] = await Promise.all([
        adapter.syncProfile({
          auth,
          externalId: profile.externalId,
          accessToken: token,
        }),
        adapter.syncPosts({
          auth,
          externalId: profile.externalId,
          accessToken: token,
        }),
      ]);
      db.transaction((tx) => {
        tx.insert(socialMetricSnapshots)
          .values({
            id: newId("sms"),
            projectId: project.id,
            profileId: profile.id,
            platform: profile.platform,
            capturedDate: dateKey(metric.capturedAt),
            followers: metric.followers,
            reach: metric.reach,
            impressions: metric.impressions,
            interactions: metric.interactions,
            posts: metric.posts,
            source: metric.source,
            capturedAt: metric.capturedAt,
          })
          .onConflictDoUpdate({
            target: [
              socialMetricSnapshots.profileId,
              socialMetricSnapshots.capturedDate,
            ],
            set: {
              followers: metric.followers,
              reach: metric.reach,
              impressions: metric.impressions,
              interactions: metric.interactions,
              posts: metric.posts,
              source: metric.source,
              capturedAt: metric.capturedAt,
            },
          })
          .run();
        for (const post of posts) {
          tx.insert(socialContentSnapshots)
            .values({
              id: newId("scs"),
              projectId: project.id,
              profileId: profile.id,
              externalPostId: post.externalPostId,
              externalUrl: post.externalUrl,
              caption: post.caption,
              mediaUrl: post.mediaUrl,
              publishedAt: post.publishedAt,
              likes: post.likes,
              comments: post.comments,
              shares: post.shares,
              saves: post.saves,
              reach: post.reach,
              impressions: post.impressions,
              source: post.source,
              capturedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                socialContentSnapshots.profileId,
                socialContentSnapshots.externalPostId,
              ],
              set: {
                externalUrl: post.externalUrl,
                caption: post.caption,
                mediaUrl: post.mediaUrl,
                publishedAt: post.publishedAt,
                likes: post.likes,
                comments: post.comments,
                shares: post.shares,
                saves: post.saves,
                reach: post.reach,
                impressions: post.impressions,
                source: post.source,
                capturedAt: new Date(),
              },
            })
            .run();
        }
      });
      await db
        .update(socialProfiles)
        .set({
          lastSyncedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(socialProfiles.id, profile.id));
      succeeded += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "지표 동기화에 실패했습니다.";
      if (
        error instanceof SocialProviderError &&
        error.code === "reconnect_required"
      )
        await markReconnect(profile, message);
      else
        await db
          .update(socialProfiles)
          .set({ lastError: message, updatedAt: new Date() })
          .where(eq(socialProfiles.id, profile.id));
      errors.push(`${profile.displayName}: ${message}`);
      failed += 1;
    }
    await db
      .update(socialRuns)
      .set({
        succeededCount: succeeded,
        failedCount: failed,
        updatedAt: new Date(),
      })
      .where(eq(socialRuns.id, run.id));
  }
  const instagram = profiles.find(
    (profile) => profile.platform === "instagram_professional",
  );
  if (instagram) {
    const competitors = await db
      .select()
      .from(socialCompetitors)
      .where(
        and(
          eq(socialCompetitors.projectId, project.id),
          isNull(socialCompetitors.deletedAt),
        ),
      );
    const adapter = socialProvider("instagram_professional");
    const token = await getDecryptedSocialProfileToken(instagram);
    for (const competitor of competitors) {
      if (!competitor.instagramUsername || !adapter.lookupCompetitor) continue;
      try {
        const metric = await adapter.lookupCompetitor({
          auth,
          ownExternalId: instagram.externalId,
          username: competitor.instagramUsername,
          accessToken: token,
        });
        await db
          .insert(socialMetricSnapshots)
          .values({
            id: newId("sms"),
            projectId: project.id,
            competitorId: competitor.id,
            platform: "instagram_professional",
            capturedDate: dateKey(metric.capturedAt),
            followers: metric.followers,
            posts: metric.posts,
            source: metric.source,
            capturedAt: metric.capturedAt,
          })
          .onConflictDoUpdate({
            target: [
              socialMetricSnapshots.competitorId,
              socialMetricSnapshots.platform,
              socialMetricSnapshots.capturedDate,
            ],
            set: {
              followers: metric.followers,
              posts: metric.posts,
              source: metric.source,
              capturedAt: metric.capturedAt,
            },
          });
        await db
          .update(socialCompetitors)
          .set({
            externalId: metric.externalId,
            status: "active",
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(socialCompetitors.id, competitor.id));
      } catch (error) {
        await db
          .update(socialCompetitors)
          .set({
            status:
              error instanceof SocialProviderError &&
              error.code === "unsupported"
                ? "unavailable"
                : "error",
            lastError:
              error instanceof Error
                ? error.message
                : "경쟁 프로필 동기화에 실패했습니다.",
            updatedAt: new Date(),
          })
          .where(eq(socialCompetitors.id, competitor.id));
      }
    }
  }
  const completedAt = new Date();
  const status =
    failed === 0 ? "completed" : succeeded > 0 ? "partial" : "failed";
  const [updated] = await db
    .update(socialRuns)
    .set({
      status,
      succeededCount: succeeded,
      failedCount: failed,
      errorMessage: errors.length ? errors.join("\n") : null,
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(socialRuns.id, run.id))
    .returning();
  await db
    .update(socialProjects)
    .set({
      lastSyncAt: completedAt,
      nextSyncAt: new Date(completedAt.getTime() + SYNC_INTERVAL_MS),
      updatedAt: completedAt,
    })
    .where(eq(socialProjects.id, project.id));
  return runView(updated);
}

export async function getSocialRun(auth: AuthContext, runId: string) {
  const [run] = await db
    .select({ run: socialRuns })
    .from(socialRuns)
    .innerJoin(socialProjects, eq(socialProjects.id, socialRuns.projectId))
    .where(
      and(
        eq(socialRuns.id, runId),
        eq(socialProjects.workspaceId, auth.workspaceId),
        isNull(socialRuns.deletedAt),
      ),
    )
    .limit(1);
  if (!run) throw new ApiError("NOT_FOUND", "소셜 실행을 찾을 수 없습니다.");
  return runView(run.run);
}

export async function processDueSocial(options?: {
  now?: Date;
  limit?: number;
}) {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 10;
  const staleAt = new Date(now.getTime() - STALE_WORK_MS);
  const interruptedSyncs = await db
    .select({ run: socialRuns, project: socialProjects })
    .from(socialRuns)
    .innerJoin(socialProjects, eq(socialProjects.id, socialRuns.projectId))
    .where(
      and(
        eq(socialRuns.kind, "sync"),
        or(
          eq(socialRuns.status, "queued"),
          and(
            eq(socialRuns.status, "running"),
            lte(socialRuns.updatedAt, staleAt),
          ),
        ),
        isNull(socialRuns.deletedAt),
        isNull(socialProjects.deletedAt),
      ),
    )
    .orderBy(asc(socialRuns.createdAt))
    .limit(limit);
  const duePosts = await db
    .select({ post: socialPosts, project: socialProjects })
    .from(socialPosts)
    .innerJoin(socialProjects, eq(socialProjects.id, socialPosts.projectId))
    .where(
      and(
        or(
          and(
            eq(socialPosts.status, "queued"),
            lte(socialPosts.scheduledAt, now),
          ),
          and(
            eq(socialPosts.status, "publishing"),
            lte(socialPosts.updatedAt, staleAt),
          ),
        ),
        isNull(socialPosts.deletedAt),
        isNull(socialProjects.deletedAt),
      ),
    )
    .orderBy(asc(socialPosts.scheduledAt))
    .limit(limit);
  const dueProjects = await db
    .select()
    .from(socialProjects)
    .where(
      and(
        eq(socialProjects.syncEnabled, true),
        lte(socialProjects.nextSyncAt, now),
        isNull(socialProjects.deletedAt),
      ),
    )
    .limit(limit);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const recoveringProjects = new Set(
    interruptedSyncs.map((row) => row.project.id),
  );
  for (const item of interruptedSyncs) {
    try {
      await executeSocialSync(cronAuth(item.project), item.run.id);
      results.push({ id: item.run.id, ok: true });
    } catch (error) {
      results.push({
        id: item.run.id,
        ok: false,
        error: error instanceof Error ? error.message : "동기화 복구 실패",
      });
    }
  }
  for (const item of duePosts) {
    const auth = cronAuth(item.project);
    try {
      await publishSocialPost(auth, item.post.id, "scheduled");
      results.push({ id: item.post.id, ok: true });
    } catch (error) {
      results.push({
        id: item.post.id,
        ok: false,
        error: error instanceof Error ? error.message : "발행 실패",
      });
    }
  }
  for (const project of dueProjects) {
    if (recoveringProjects.has(project.id)) continue;
    const auth = cronAuth(project);
    try {
      const run = await enqueueSocialSync(auth, project.folderId, "scheduled");
      await executeSocialSync(auth, run.id);
      results.push({ id: project.id, ok: true });
    } catch (error) {
      results.push({
        id: project.id,
        ok: false,
        error: error instanceof Error ? error.message : "동기화 실패",
      });
    }
  }
  const cutoff = new Date(now.getTime() - 400 * 86_400_000);
  await db
    .delete(socialMetricSnapshots)
    .where(lt(socialMetricSnapshots.capturedAt, cutoff));
  await db
    .delete(socialContentSnapshots)
    .where(lt(socialContentSnapshots.capturedAt, cutoff));
  return {
    scanned:
      interruptedSyncs.length +
      duePosts.length +
      dueProjects.filter((project) => !recoveringProjects.has(project.id))
        .length,
    processed: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    errors: results.flatMap((row) =>
      row.error ? [`${row.id}: ${row.error}`] : [],
    ),
  };
}

function cronAuth(project: typeof socialProjects.$inferSelect): AuthContext {
  return {
    userId: project.createdBy ?? "system-cron",
    email: "cron@localhost",
    name: "소셜 예약 실행",
    workspaceId: project.workspaceId,
    workspaceName: "Scheduled social",
    workspacePlan: "pro",
    role: "owner",
    sessionId: "cron:social",
    ip: null,
    userAgent: null,
  };
}
