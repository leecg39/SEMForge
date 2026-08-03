import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  socialCompetitors,
  socialContentSnapshots,
  socialMetricSnapshots,
  socialPosts,
  socialPostTags,
  socialPostTargets,
  socialProfiles,
  socialTags,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import { assertCan } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import type {
  SocialAnalyticsResponse,
  SocialContentInsightRow,
  SocialOverviewResponse,
  SocialRecommendation,
} from "@/types/social";
import { getSocialSettings, listSocialProjects } from "./projects";
import { listSocialPosts } from "./posts";

export type SocialRange = "7d" | "28d" | "90d" | "400d";

function daysForRange(range: SocialRange) {
  return Number.parseInt(range, 10);
}

function startOfRange(range: SocialRange, now = new Date()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysForRange(range) + 1);
  return date;
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function buildSocialRecommendations(input: {
  fid: string;
  profiles: number;
  published: number;
  previousPublished: number;
  scheduled: number;
  failed: number;
  reconnect: number;
}): SocialRecommendation[] {
  const query = `?fid=${encodeURIComponent(input.fid)}`;
  const rows: SocialRecommendation[] = [];
  if (input.profiles === 0)
    rows.push({
      id: "connect",
      title: "소셜 프로필 연결하기",
      description:
        "실제 게시와 지표 동기화를 시작하려면 Facebook Page, Instagram Professional 또는 Google Business Profile을 연결하세요.",
      severity: "high",
      href: `/social-media/${query}#connections`,
      cta: "연결 설정",
    });
  if (input.reconnect > 0)
    rows.push({
      id: "reconnect",
      title: "만료된 인증 다시 연결하기",
      description: `${input.reconnect}개 프로필의 인증 또는 권한을 확인해야 합니다.`,
      severity: "high",
      href: `/social-media/${query}#connections`,
      cta: "연결 확인",
    });
  if (input.failed > 0)
    rows.push({
      id: "retry",
      title: "발행 실패 확인하기",
      description: `최근 기간에 ${input.failed}건의 발행 실패가 있습니다. 성공한 플랫폼은 유지되며 실패 대상만 재시도할 수 있습니다.`,
      severity: "high",
      href: `/social-media/poster/${query}#failed`,
      cta: "실패 게시물 보기",
    });
  if (input.profiles > 0 && input.scheduled === 0)
    rows.push({
      id: "calendar",
      title: "다음 게시 일정 채우기",
      description:
        "예정된 게시물이 없습니다. 주간 반복 또는 예약 게시로 공백을 줄여 보세요.",
      severity: "medium",
      href: `/social-media/poster/${query}`,
      cta: "게시물 예약",
    });
  if (input.previousPublished > 0 && input.published < input.previousPublished)
    rows.push({
      id: "activity",
      title: "게시 활동 감소 확인하기",
      description: `이전 기간 ${input.previousPublished}건에서 ${input.published}건으로 게시 활동이 줄었습니다.`,
      severity: "medium",
      href: `/social-media/analytics/${query}`,
      cta: "추이 보기",
    });
  if (rows.length === 0)
    rows.push({
      id: "insights",
      title: "반응이 좋은 콘텐츠 확인하기",
      description:
        "연결된 플랫폼의 실제 게시물 반응을 확인하고 다음 콘텐츠 계획에 반영하세요.",
      severity: "info",
      href: `/social-media/content-insights/${query}`,
      cta: "콘텐츠 인사이트",
    });
  return rows.slice(0, 4);
}

export async function getSocialOverview(
  auth: AuthContext,
  folderId: string,
  range: Exclude<SocialRange, "400d"> = "28d",
): Promise<SocialOverviewResponse> {
  const settings = await getSocialSettings(auth, folderId);
  const projects = await listSocialProjects(auth);
  const now = new Date();
  const from = startOfRange(range, now);
  const days = daysForRange(range);
  const previousFrom = new Date(from.getTime() - days * 86_400_000);
  const previousTo = new Date(from.getTime() - 1);
  const [current, previous, upcoming, recentFailures] = await Promise.all([
    listSocialPosts(auth, folderId, { from, to: now, limit: 200 }),
    listSocialPosts(auth, folderId, {
      from: previousFrom,
      to: previousTo,
      limit: 200,
    }),
    listSocialPosts(auth, folderId, {
      from: now,
      statuses: ["pending_approval", "queued"],
      limit: 8,
    }),
    listSocialPosts(auth, folderId, {
      from,
      statuses: ["failed", "partial"],
      limit: 8,
    }),
  ]);
  const published = current.filter(
    (post) => post.status === "published" || post.status === "partial",
  ).length;
  const scheduled = upcoming.length;
  const failed = current.filter(
    (post) => post.status === "failed" || post.status === "partial",
  ).length;
  const previousPublished = previous.filter(
    (post) => post.status === "published" || post.status === "partial",
  ).length;
  const activityMap = new Map<
    string,
    { published: number; scheduled: number; failed: number }
  >();
  for (
    let cursor = new Date(from);
    cursor <= now;
    cursor.setDate(cursor.getDate() + 1)
  )
    activityMap.set(dayKey(cursor), { published: 0, scheduled: 0, failed: 0 });
  for (const post of current) {
    const key = dayKey(new Date(post.scheduledAt ?? post.createdAt));
    const bucket = activityMap.get(key);
    if (!bucket) continue;
    if (post.status === "published" || post.status === "partial")
      bucket.published += 1;
    if (post.status === "queued" || post.status === "pending_approval")
      bucket.scheduled += 1;
    if (post.status === "failed" || post.status === "partial")
      bucket.failed += 1;
  }
  return {
    project: settings.project,
    projects,
    range,
    kpis: {
      published,
      scheduled,
      failed,
      connectedProfiles: settings.profiles.filter((row) => row.enabled).length,
    },
    recommendations: buildSocialRecommendations({
      fid: folderId,
      profiles: settings.profiles.length,
      published,
      previousPublished,
      scheduled,
      failed,
      reconnect: settings.profiles.filter((row) =>
        Boolean(row.lastError?.match(/인증|권한|연결/u)),
      ).length,
    }),
    activity: [...activityMap].map(([date, value]) => ({ date, ...value })),
    upcoming,
    recentFailures,
    profiles: settings.profiles,
    lastSyncedAt:
      settings.profiles
        .flatMap((row) => (row.lastSyncedAt ? [row.lastSyncedAt] : []))
        .sort()
        .at(-1) ?? null,
  };
}

function sumNullable(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

export async function getSocialAnalytics(
  auth: AuthContext,
  folderId: string,
  options?: { range?: SocialRange; profileId?: string | null },
): Promise<SocialAnalyticsResponse> {
  const settings = await getSocialSettings(auth, folderId);
  const projectId = settings.project.id;
  const range = options?.range ?? "28d";
  const from = startOfRange(range);
  const conditions = [
    eq(socialMetricSnapshots.projectId, projectId),
    gte(socialMetricSnapshots.capturedAt, from),
  ];
  if (options?.profileId)
    conditions.push(eq(socialMetricSnapshots.profileId, options.profileId));
  const rows = await db
    .select()
    .from(socialMetricSnapshots)
    .where(and(...conditions))
    .orderBy(asc(socialMetricSnapshots.capturedAt));
  const latestByProfile = new Map<
    string,
    typeof socialMetricSnapshots.$inferSelect
  >();
  for (const row of rows)
    if (row.profileId) latestByProfile.set(row.profileId, row);
  const latest = [...latestByProfile.values()];
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = grouped.get(row.capturedDate) ?? [];
    group.push(row);
    grouped.set(row.capturedDate, group);
  }
  const trend = options?.profileId
    ? rows.flatMap((row) =>
        row.profileId
          ? [
              {
                date: row.capturedDate,
                profileId: row.profileId,
                followers: row.followers,
                reach: row.reach,
                impressions: row.impressions,
                interactions: row.interactions,
                posts: row.posts,
              },
            ]
          : [],
      )
    : [...grouped].map(([date, group]) => ({
        date,
        profileId: "all",
        followers: sumNullable(group.map((row) => row.followers)),
        reach: sumNullable(group.map((row) => row.reach)),
        impressions: sumNullable(group.map((row) => row.impressions)),
        interactions: sumNullable(group.map((row) => row.interactions)),
        posts: sumNullable(group.map((row) => row.posts)),
      }));
  return {
    projectId,
    range,
    profiles: settings.profiles,
    summary: {
      followers: sumNullable(latest.map((row) => row.followers)),
      reach: sumNullable(latest.map((row) => row.reach)),
      impressions: sumNullable(latest.map((row) => row.impressions)),
      interactions: sumNullable(latest.map((row) => row.interactions)),
      posts: sumNullable(latest.map((row) => row.posts)),
    },
    trend,
    note: "플랫폼 합산 도달·노출은 플랫폼 간 중복 사용자를 제거하지 않은 단순 합산입니다. 제공되지 않은 지표는 측정 불가로 표시합니다.",
  };
}

export async function getSocialContentInsights(
  auth: AuthContext,
  folderId: string,
  options?: {
    range?: SocialRange;
    profileId?: string | null;
    tagId?: string | null;
    page?: number;
    pageSize?: number;
  },
) {
  const settings = await getSocialSettings(auth, folderId);
  const range = options?.range ?? "28d";
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(1_000, Math.max(1, options?.pageSize ?? 20));
  const conditions = [
    eq(socialContentSnapshots.projectId, settings.project.id),
    gte(socialContentSnapshots.publishedAt, startOfRange(range)),
  ];
  if (options?.profileId)
    conditions.push(eq(socialContentSnapshots.profileId, options.profileId));
  const rows = await db
    .select({ snapshot: socialContentSnapshots, profile: socialProfiles })
    .from(socialContentSnapshots)
    .innerJoin(
      socialProfiles,
      eq(socialProfiles.id, socialContentSnapshots.profileId),
    )
    .where(and(...conditions))
    .orderBy(desc(socialContentSnapshots.publishedAt));
  let filtered = rows;
  if (options?.tagId) {
    const taggedPosts = await db
      .select({ externalPostId: socialContentSnapshots.externalPostId })
      .from(socialPostTags)
      .innerJoin(socialPosts, eq(socialPosts.id, socialPostTags.postId))
      .innerJoin(
        socialPostTargets,
        eq(socialPostTargets.postId, socialPosts.id),
      )
      .innerJoin(
        socialContentSnapshots,
        eq(
          socialContentSnapshots.externalPostId,
          socialPostTargets.externalPostId,
        ),
      )
      .where(eq(socialPostTags.tagId, options.tagId));
    const ids = new Set(taggedPosts.map((row) => row.externalPostId));
    filtered = rows.filter((row) => ids.has(row.snapshot.externalPostId));
  }
  const mapped: SocialContentInsightRow[] = filtered.map(
    ({ snapshot, profile }) => {
      const interactions = sumNullable([
        snapshot.likes,
        snapshot.comments,
        snapshot.shares,
        snapshot.saves,
      ]);
      return {
        id: snapshot.id,
        profileId: profile.id,
        platform: profile.platform,
        profileName: profile.displayName,
        caption: snapshot.caption,
        mediaUrl: snapshot.mediaUrl,
        externalUrl: snapshot.externalUrl,
        publishedAt: snapshot.publishedAt.toISOString(),
        likes: snapshot.likes,
        comments: snapshot.comments,
        shares: snapshot.shares,
        saves: snapshot.saves,
        reach: snapshot.reach,
        impressions: snapshot.impressions,
        interactions,
        engagementRate:
          interactions !== null && snapshot.reach && snapshot.reach > 0
            ? Math.round((interactions / snapshot.reach) * 10_000) / 100
            : null,
      };
    },
  );
  return {
    project: settings.project,
    profiles: settings.profiles,
    rows: mapped.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      total: mapped.length,
      totalPages: Math.max(1, Math.ceil(mapped.length / pageSize)),
    },
  };
}

export async function listSocialTags(auth: AuthContext, folderId: string) {
  const settings = await getSocialSettings(auth, folderId);
  return db
    .select()
    .from(socialTags)
    .where(
      and(
        eq(socialTags.projectId, settings.project.id),
        isNull(socialTags.deletedAt),
      ),
    )
    .orderBy(asc(socialTags.name));
}

export async function createSocialTag(
  auth: AuthContext,
  folderId: string,
  input: { name: string; color?: string; description?: string | null },
) {
  assertCan(auth, "create");
  const settings = await getSocialSettings(auth, folderId);
  const name = input.name.trim();
  if (!name || name.length > 40)
    throw new ApiError("VALIDATION_ERROR", "태그 이름은 1~40자여야 합니다.");
  const color = /^#[0-9a-f]{6}$/iu.test(input.color ?? "")
    ? input.color!
    : "#6b6de3";
  const [created] = await db
    .insert(socialTags)
    .values({
      id: newId("sot"),
      projectId: settings.project.id,
      name,
      normalizedName: name.toLocaleLowerCase("ko-KR"),
      description: input.description?.trim() || null,
      color,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning();
  return created;
}

export async function deleteSocialTag(
  auth: AuthContext,
  folderId: string,
  tagId: string,
) {
  assertCan(auth, "delete");
  const settings = await getSocialSettings(auth, folderId);
  const result = await db
    .update(socialTags)
    .set({ deletedAt: new Date(), deletedBy: auth.userId })
    .where(
      and(
        eq(socialTags.id, tagId),
        eq(socialTags.projectId, settings.project.id),
        isNull(socialTags.deletedAt),
      ),
    )
    .returning();
  if (!result.length)
    throw new ApiError("NOT_FOUND", "태그를 찾을 수 없습니다.");
}

export async function listSocialCompetitors(
  auth: AuthContext,
  folderId: string,
) {
  const settings = await getSocialSettings(auth, folderId);
  const competitors = await db
    .select()
    .from(socialCompetitors)
    .where(
      and(
        eq(socialCompetitors.projectId, settings.project.id),
        isNull(socialCompetitors.deletedAt),
      ),
    )
    .orderBy(asc(socialCompetitors.name));
  const metrics = await db
    .select()
    .from(socialMetricSnapshots)
    .where(
      and(
        eq(socialMetricSnapshots.projectId, settings.project.id),
        gte(socialMetricSnapshots.capturedAt, startOfRange("28d")),
      ),
    )
    .orderBy(desc(socialMetricSnapshots.capturedAt));
  return competitors.map((row) => ({
    ...row,
    latestMetric:
      metrics.find((metric) => metric.competitorId === row.id) ?? null,
  }));
}

export async function createSocialCompetitor(
  auth: AuthContext,
  folderId: string,
  input: {
    name: string;
    domain?: string | null;
    instagramUsername?: string | null;
  },
) {
  assertCan(auth, "create");
  const settings = await getSocialSettings(auth, folderId);
  const countRows = await db
    .select({ value: sql<number>`count(*)` })
    .from(socialCompetitors)
    .where(
      and(
        eq(socialCompetitors.projectId, settings.project.id),
        isNull(socialCompetitors.deletedAt),
      ),
    );
  if ((countRows[0]?.value ?? 0) >= 10)
    throw new ApiError(
      "PLAN_LIMIT",
      "경쟁 프로필은 프로젝트당 최대 10개까지 등록할 수 있습니다.",
    );
  const name = input.name.trim();
  if (!name)
    throw new ApiError("VALIDATION_ERROR", "경쟁사 이름이 필요합니다.");
  const username = input.instagramUsername?.trim().replace(/^@/u, "") || null;
  const [created] = await db
    .insert(socialCompetitors)
    .values({
      id: newId("soc"),
      projectId: settings.project.id,
      name,
      domain: input.domain?.trim() || null,
      instagramUsername: username,
      status: username ? "pending" : "unavailable",
      lastError: username
        ? null
        : "공식 API에서 비교 가능한 Instagram 사용자 이름이 필요합니다.",
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning();
  return created;
}

export async function deleteSocialCompetitor(
  auth: AuthContext,
  folderId: string,
  competitorId: string,
) {
  assertCan(auth, "delete");
  const settings = await getSocialSettings(auth, folderId);
  const result = await db
    .update(socialCompetitors)
    .set({ deletedAt: new Date(), deletedBy: auth.userId })
    .where(
      and(
        eq(socialCompetitors.id, competitorId),
        eq(socialCompetitors.projectId, settings.project.id),
        isNull(socialCompetitors.deletedAt),
      ),
    )
    .returning();
  if (!result.length)
    throw new ApiError("NOT_FOUND", "경쟁 프로필을 찾을 수 없습니다.");
}

export function socialCsv(rows: SocialContentInsightRow[]) {
  const quote = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    [
      "platform",
      "profile",
      "published_at",
      "caption",
      "likes",
      "comments",
      "shares",
      "saves",
      "reach",
      "impressions",
      "engagement_rate",
    ]
      .map(quote)
      .join(","),
    ...rows.map((row) =>
      [
        row.platform,
        row.profileName,
        row.publishedAt,
        row.caption,
        row.likes,
        row.comments,
        row.shares,
        row.saves,
        row.reach,
        row.impressions,
        row.engagementRate,
      ]
        .map(quote)
        .join(","),
    ),
  ].join("\n");
}
