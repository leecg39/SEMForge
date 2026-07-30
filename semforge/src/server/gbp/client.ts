import { ApiError } from "@/lib/api";

/**
 * Google Business Profile API 클라이언트.
 * - 계정: mybusinessaccountmanagement.googleapis.com/v1/accounts
 * - 위치: mybusinessbusinessinformation.googleapis.com/v1/{account}/locations
 * - 리뷰: mybusiness.googleapis.com/v4/{location}/reviews (레거시 v4, GCP에서 API 활성화 필요)
 * 리뷰 API가 계정 권한/미활성화로 403을 반환하면 unavailable 로 정직하게 처리한다.
 */

const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS_BASE = "https://mybusiness.googleapis.com/v4";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class GbpUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GbpUnavailableError";
  }
}

async function gbpFetch<T>(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "Google Business Profile API 응답이 시간 초과되었습니다."
        : "Google Business Profile API에 연결하지 못했습니다.",
      { details: error instanceof Error ? error.message : String(error) }
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // 일부 엔드포인트(리뷰 답글)는 빈 본문을 반환할 수 있다.
  }

  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "object"
      ? JSON.stringify(payload.error).slice(0, 300)
      : `HTTP ${response.status}`;
    if (response.status === 401) {
      throw new ApiError("UNAUTHENTICATED", "Google Business Profile 인증이 만료되었습니다. 다시 연결해 주세요.");
    }
    if (response.status === 403) {
      throw new GbpUnavailableError(
        "Google Business Profile API 접근이 거부되었습니다. GCP 프로젝트에서 Business Profile API 계열을 활성화했는지 확인해 주세요."
      );
    }
    if (response.status === 429) {
      throw new ApiError("RATE_LIMITED", "Google Business Profile API 사용량 한도에 도달했습니다.");
    }
    throw new ApiError("INTERNAL", `Google Business Profile API 오류: ${message}`);
  }

  return payload as T;
}

/* ------------------------------------------------------------------ */
/* 계정 / 위치                                                         */
/* ------------------------------------------------------------------ */

export interface GbpAccount {
  /** accounts/{accountId} 형태의 리소스 이름 */
  name: string;
  accountName: string | null;
  type: string | null;
}

export async function listGbpAccounts(accessToken: string): Promise<GbpAccount[]> {
  const payload = await gbpFetch<{ accounts?: Record<string, unknown>[] }>(
    `${ACCOUNT_MGMT_BASE}/accounts`,
    accessToken
  );
  const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
  return accounts.map((account) => ({
    name: typeof account.name === "string" ? account.name : "",
    accountName: typeof account.accountName === "string" ? account.accountName : null,
    type: typeof account.type === "string" ? account.type : null,
  })).filter((account) => account.name.length > 0);
}

export interface GbpLocation {
  /** accounts/{accountId}/locations/{locationId} 형태의 리소스 이름 */
  name: string;
  title: string;
  address: string | null;
  phone: string | null;
  websiteUri: string | null;
  primaryCategory: string | null;
}

const LOCATION_READ_MASK = "name,title,storefrontAddress,phoneNumbers,websiteUri,categories";

export async function listGbpLocations(
  accessToken: string,
  accountResourceName: string
): Promise<GbpLocation[]> {
  const url = new URL(`${BUSINESS_INFO_BASE}/${accountResourceName}/locations`);
  url.searchParams.set("readMask", LOCATION_READ_MASK);
  url.searchParams.set("pageSize", "100");
  const payload = await gbpFetch<{ locations?: Record<string, unknown>[] }>(
    url.toString(),
    accessToken
  );
  const locations = Array.isArray(payload?.locations) ? payload.locations : [];
  return locations.map((location) => {
    const address = isRecord(location.storefrontAddress)
      ? [
          ...(Array.isArray(location.storefrontAddress.addressLines)
            ? (location.storefrontAddress.addressLines as unknown[]).filter(
                (line): line is string => typeof line === "string"
              )
            : []),
          typeof location.storefrontAddress.locality === "string"
            ? location.storefrontAddress.locality
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : null;
    const phones = isRecord(location.phoneNumbers) ? location.phoneNumbers : null;
    const categories = isRecord(location.categories) ? location.categories : null;
    const primary =
      categories && isRecord(categories.primaryCategory)
        ? typeof categories.primaryCategory.displayName === "string"
          ? categories.primaryCategory.displayName
          : null
        : null;
    return {
      name: typeof location.name === "string" ? location.name : "",
      title: typeof location.title === "string" ? location.title : "(이름 없음)",
      address: address && address.trim().length > 0 ? address : null,
      phone: phones && typeof phones.primaryPhone === "string" ? phones.primaryPhone : null,
      websiteUri: typeof location.websiteUri === "string" ? location.websiteUri : null,
      primaryCategory: primary,
    };
  }).filter((location) => location.name.length > 0);
}

/* ------------------------------------------------------------------ */
/* 리뷰                                                               */
/* ------------------------------------------------------------------ */

export interface GbpReview {
  name: string;
  reviewerName: string;
  starRating: number | null;
  comment: string | null;
  createTime: string | null;
  updateTime: string | null;
  reviewReply: { comment: string; updateTime: string | null } | null;
}

const STAR_RATING_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export interface GbpReviewPage {
  reviews: GbpReview[];
  averageRating: number | null;
  totalReviewCount: number | null;
  nextPageToken: string | null;
}

export async function listGbpReviews(
  accessToken: string,
  locationResourceName: string,
  options?: { pageSize?: number; pageToken?: string }
): Promise<GbpReviewPage> {
  const url = new URL(`${REVIEWS_BASE}/${locationResourceName}/reviews`);
  url.searchParams.set("pageSize", String(options?.pageSize ?? 50));
  if (options?.pageToken) url.searchParams.set("pageToken", options.pageToken);
  const payload = await gbpFetch<Record<string, unknown>>(url.toString(), accessToken);

  const reviewsRaw = Array.isArray(payload?.reviews) ? payload.reviews : [];
  const reviews: GbpReview[] = reviewsRaw.filter(isRecord).map((review) => {
    const rating =
      typeof review.starRating === "string"
        ? (STAR_RATING_MAP[review.starRating] ?? null)
        : typeof review.starRating === "number"
          ? review.starRating
          : null;
    const reply = isRecord(review.reviewReply)
      ? {
          comment: typeof review.reviewReply.comment === "string" ? review.reviewReply.comment : "",
          updateTime:
            typeof review.reviewReply.updateTime === "string" ? review.reviewReply.updateTime : null,
        }
      : null;
    return {
      name: typeof review.name === "string" ? review.name : "",
      reviewerName: isRecord(review.reviewer) && typeof review.reviewer.displayName === "string"
        ? review.reviewer.displayName
        : "익명",
      starRating: rating,
      comment: typeof review.comment === "string" ? review.comment : null,
      createTime: typeof review.createTime === "string" ? review.createTime : null,
      updateTime: typeof review.updateTime === "string" ? review.updateTime : null,
      reviewReply: reply && reply.comment.length > 0 ? reply : null,
    };
  });

  return {
    reviews,
    averageRating:
      typeof payload?.averageRating === "number" ? payload.averageRating : null,
    totalReviewCount:
      typeof payload?.totalReviewCount === "number" ? payload.totalReviewCount : null,
    nextPageToken: typeof payload?.nextPageToken === "string" ? payload.nextPageToken : null,
  };
}

/** 리뷰 답글 등록/수정. */
export async function replyToGbpReview(
  accessToken: string,
  reviewResourceName: string,
  comment: string
): Promise<void> {
  await gbpFetch(
    `${REVIEWS_BASE}/${reviewResourceName}/reply`,
    accessToken,
    { method: "PUT", body: JSON.stringify({ comment }) }
  );
}
