import { getValidGbpAccessToken } from "@/server/gbp/connections";
import type { SocialPlatform } from "@/types/social";
import { getSocialCapabilities } from "./projects";
import {
  SocialProviderError,
  type SocialCompetitorMetric,
  type SocialContentMetric,
  type SocialProfileMetric,
  type SocialProviderAdapter,
  type SocialPublishInput,
  type SocialPublishResult,
} from "./contracts";

const TIMEOUT_MS = 30_000;

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function providerJson(
  url: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw new SocialProviderError(
      controller.signal.aborted
        ? "소셜 플랫폼 응답 시간이 초과되었습니다."
        : "소셜 플랫폼에 연결하지 못했습니다.",
      controller.signal.aborted ? "timeout" : "provider_error",
      true,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timer);
  }
  let payload: unknown = {};
  try {
    payload = await response.json();
  } catch {
    /* provider sometimes returns an empty body */
  }
  const data = object(payload);
  if (!response.ok || data.error) {
    const providerError = object(data.error);
    const message =
      stringOrNull(providerError.message) ?? `HTTP ${response.status}`;
    if (
      response.status === 401 ||
      response.status === 403 ||
      providerError.code === 190
    ) {
      throw new SocialProviderError(
        `소셜 계정 인증이 만료되었거나 권한이 취소되었습니다: ${message}`,
        "reconnect_required",
        false,
        data,
      );
    }
    if (
      response.status === 429 ||
      providerError.code === 4 ||
      providerError.code === 17 ||
      providerError.code === 32
    ) {
      throw new SocialProviderError(
        `소셜 플랫폼 요청 한도를 초과했습니다: ${message}`,
        "rate_limited",
        true,
        data,
      );
    }
    throw new SocialProviderError(
      `소셜 플랫폼 요청이 실패했습니다: ${message}`,
      "provider_error",
      response.status >= 500,
      data,
    );
  }
  return data;
}

function metaBase(): string {
  const version = process.env.META_GRAPH_API_VERSION?.trim();
  if (!version)
    throw new SocialProviderError(
      "META_GRAPH_API_VERSION이 설정되지 않았습니다.",
      "unsupported",
      false,
    );
  return `https://graph.facebook.com/${version}`;
}

function requireToken(token: string | null): string {
  if (!token)
    throw new SocialProviderError(
      "소셜 프로필 액세스 토큰이 없습니다. 계정을 다시 연결해 주세요.",
      "reconnect_required",
      false,
    );
  return token;
}

async function facebookPublish(
  input: SocialPublishInput,
): Promise<SocialPublishResult> {
  const token = requireToken(input.accessToken);
  const endpoint = input.publicImageUrl ? "photos" : "feed";
  const body = new URLSearchParams({ access_token: token });
  if (input.publicImageUrl) {
    body.set("url", input.publicImageUrl);
    body.set(
      "caption",
      [input.text, input.linkUrl].filter(Boolean).join("\n\n"),
    );
    body.set("published", "true");
  } else {
    body.set("message", input.text);
    if (input.linkUrl) body.set("link", input.linkUrl);
  }
  const result = await providerJson(
    `${metaBase()}/${encodeURIComponent(input.externalId)}/${endpoint}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const id = stringOrNull(result.post_id) ?? stringOrNull(result.id);
  if (!id)
    throw new SocialProviderError(
      "Facebook이 게시물 ID를 반환하지 않았습니다.",
      "provider_error",
      false,
      result,
    );
  return {
    externalPostId: id,
    externalUrl: `https://www.facebook.com/${id.replace("_", "/posts/")}`,
    publishedAt: new Date(),
  };
}

async function instagramPublish(
  input: SocialPublishInput,
): Promise<SocialPublishResult> {
  const token = requireToken(input.accessToken);
  if (!input.publicImageUrl)
    throw new SocialProviderError(
      "Instagram 게시에는 공개 가능한 단일 이미지가 필요합니다.",
      "unsupported",
      false,
    );
  const create = new URLSearchParams({
    image_url: input.publicImageUrl,
    caption: [input.text, input.linkUrl].filter(Boolean).join("\n\n"),
    access_token: token,
  });
  const container = await providerJson(
    `${metaBase()}/${encodeURIComponent(input.externalId)}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: create,
    },
  );
  const creationId = stringOrNull(container.id);
  if (!creationId)
    throw new SocialProviderError(
      "Instagram 미디어 컨테이너를 만들지 못했습니다.",
      "provider_error",
      true,
      container,
    );
  const publish = await providerJson(
    `${metaBase()}/${encodeURIComponent(input.externalId)}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: token,
      }),
    },
  );
  const id = stringOrNull(publish.id);
  if (!id)
    throw new SocialProviderError(
      "Instagram이 게시물 ID를 반환하지 않았습니다.",
      "provider_error",
      false,
      publish,
    );
  return { externalPostId: id, externalUrl: null, publishedAt: new Date() };
}

async function gbpPublish(
  input: SocialPublishInput,
): Promise<SocialPublishResult> {
  const token = await getValidGbpAccessToken(input.auth);
  if (!token)
    throw new SocialProviderError(
      "Google Business Profile 연결이 필요합니다.",
      "reconnect_required",
      false,
    );
  if (!/^accounts\/[^/]+\/locations\/[^/]+$/u.test(input.externalId)) {
    throw new SocialProviderError(
      "Google Business Profile 위치 식별자가 올바르지 않습니다.",
      "provider_error",
      false,
    );
  }
  const result = await providerJson(
    `https://mybusiness.googleapis.com/v4/${input.externalId}/localPosts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        languageCode: "ko",
        summary: input.text,
        topicType: "STANDARD",
        ...(input.linkUrl
          ? { callToAction: { actionType: "LEARN_MORE", url: input.linkUrl } }
          : {}),
        ...(input.publicImageUrl
          ? {
              media: [
                { mediaFormat: "PHOTO", sourceUrl: input.publicImageUrl },
              ],
            }
          : {}),
      }),
    },
  );
  const name = stringOrNull(result.name);
  if (!name)
    throw new SocialProviderError(
      "Google Business Profile이 게시물 ID를 반환하지 않았습니다.",
      "provider_error",
      false,
      result,
    );
  return {
    externalPostId: name,
    externalUrl: stringOrNull(result.searchUrl),
    publishedAt: new Date(),
  };
}

function metaContentRows(
  data: unknown,
  platform: "facebook_page" | "instagram_professional",
): SocialContentMetric[] {
  const rows = array(object(data).data);
  return rows.flatMap((raw) => {
    const row = object(raw);
    const id = stringOrNull(row.id);
    const published = stringOrNull(
      platform === "facebook_page" ? row.created_time : row.timestamp,
    );
    if (!id || !published) return [];
    const reactions = object(object(row.reactions).summary);
    const commentsSummary = object(object(row.comments).summary);
    return [
      {
        externalPostId: id,
        externalUrl: stringOrNull(
          platform === "facebook_page" ? row.permalink_url : row.permalink,
        ),
        caption: stringOrNull(
          platform === "facebook_page" ? row.message : row.caption,
        ),
        mediaUrl: stringOrNull(
          platform === "facebook_page" ? row.full_picture : row.media_url,
        ),
        publishedAt: new Date(published),
        likes:
          platform === "facebook_page"
            ? numberOrNull(reactions.total_count)
            : numberOrNull(row.like_count),
        comments:
          platform === "facebook_page"
            ? numberOrNull(commentsSummary.total_count)
            : numberOrNull(row.comments_count),
        shares: numberOrNull(object(row.shares).count),
        saves: null,
        reach: null,
        impressions: null,
        source:
          platform === "facebook_page" ? "meta-facebook" : "meta-instagram",
      },
    ];
  });
}

const facebookAdapter: SocialProviderAdapter = {
  platform: "facebook_page",
  capabilities: () => getSocialCapabilities().facebook_page,
  publish: facebookPublish,
  async syncProfile({ externalId, accessToken }): Promise<SocialProfileMetric> {
    const token = requireToken(accessToken);
    const data = await providerJson(
      `${metaBase()}/${encodeURIComponent(externalId)}?fields=fan_count,followers_count&access_token=${encodeURIComponent(token)}`,
    );
    return {
      followers:
        numberOrNull(data.followers_count) ?? numberOrNull(data.fan_count),
      reach: null,
      impressions: null,
      interactions: null,
      posts: null,
      capturedAt: new Date(),
      source: "meta-facebook",
    };
  },
  async syncPosts({ externalId, accessToken }) {
    const token = requireToken(accessToken);
    const fields =
      "id,message,created_time,permalink_url,full_picture,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares";
    const data = await providerJson(
      `${metaBase()}/${encodeURIComponent(externalId)}/posts?limit=25&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
    );
    return metaContentRows(data, "facebook_page");
  },
};

const instagramAdapter: SocialProviderAdapter = {
  platform: "instagram_professional",
  capabilities: () => getSocialCapabilities().instagram_professional,
  publish: instagramPublish,
  async syncProfile({ externalId, accessToken }): Promise<SocialProfileMetric> {
    const token = requireToken(accessToken);
    const data = await providerJson(
      `${metaBase()}/${encodeURIComponent(externalId)}?fields=followers_count,media_count&access_token=${encodeURIComponent(token)}`,
    );
    return {
      followers: numberOrNull(data.followers_count),
      reach: null,
      impressions: null,
      interactions: null,
      posts: numberOrNull(data.media_count),
      capturedAt: new Date(),
      source: "meta-instagram",
    };
  },
  async syncPosts({ externalId, accessToken }) {
    const token = requireToken(accessToken);
    const fields =
      "id,caption,media_url,permalink,timestamp,like_count,comments_count";
    const data = await providerJson(
      `${metaBase()}/${encodeURIComponent(externalId)}/media?limit=25&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
    );
    return metaContentRows(data, "instagram_professional");
  },
  async lookupCompetitor({
    ownExternalId,
    username,
    accessToken,
  }): Promise<SocialCompetitorMetric> {
    const token = requireToken(accessToken);
    const fields = `business_discovery.username(${username}){id,followers_count,media_count}`;
    const data = await providerJson(
      `${metaBase()}/${encodeURIComponent(ownExternalId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
    );
    const discovered = object(data.business_discovery);
    if (!stringOrNull(discovered.id))
      throw new SocialProviderError(
        "Instagram 경쟁 프로필을 확인할 수 없습니다.",
        "unsupported",
        false,
        data,
      );
    return {
      externalId: stringOrNull(discovered.id),
      followers: numberOrNull(discovered.followers_count),
      posts: numberOrNull(discovered.media_count),
      source: "meta-instagram-business-discovery",
      capturedAt: new Date(),
    };
  },
};

const gbpAdapter: SocialProviderAdapter = {
  platform: "google_business_profile",
  capabilities: () => getSocialCapabilities().google_business_profile,
  publish: gbpPublish,
  async syncProfile({ auth, externalId }): Promise<SocialProfileMetric> {
    const token = await getValidGbpAccessToken(auth);
    if (!token)
      throw new SocialProviderError(
        "Google Business Profile 연결이 필요합니다.",
        "reconnect_required",
        false,
      );
    const data = await providerJson(
      `https://mybusiness.googleapis.com/v4/${externalId}/localPosts?pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return {
      followers: null,
      reach: null,
      impressions: null,
      interactions: null,
      posts: array(data.localPosts).length,
      capturedAt: new Date(),
      source: "google-business-profile",
    };
  },
  async syncPosts({ auth, externalId }) {
    const token = await getValidGbpAccessToken(auth);
    if (!token)
      throw new SocialProviderError(
        "Google Business Profile 연결이 필요합니다.",
        "reconnect_required",
        false,
      );
    const data = await providerJson(
      `https://mybusiness.googleapis.com/v4/${externalId}/localPosts?pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return array(data.localPosts).flatMap((raw): SocialContentMetric[] => {
      const row = object(raw);
      const id = stringOrNull(row.name);
      const createdAt = stringOrNull(row.createTime);
      if (!id || !createdAt) return [];
      const media = object(array(row.media)[0]);
      return [
        {
          externalPostId: id,
          externalUrl: stringOrNull(row.searchUrl),
          caption: stringOrNull(row.summary),
          mediaUrl: stringOrNull(media.sourceUrl),
          publishedAt: new Date(createdAt),
          likes: null,
          comments: null,
          shares: null,
          saves: null,
          reach: null,
          impressions: null,
          source: "google-business-profile",
        },
      ];
    });
  },
};

const adapters: Record<SocialPlatform, SocialProviderAdapter> = {
  facebook_page: facebookAdapter,
  instagram_professional: instagramAdapter,
  google_business_profile: gbpAdapter,
};

export function socialProvider(
  platform: SocialPlatform,
): SocialProviderAdapter {
  return adapters[platform];
}
