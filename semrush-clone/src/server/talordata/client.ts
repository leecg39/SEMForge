import { ApiError } from "@/lib/api";
import { normalizeDomain } from "@/lib/analytics/metrics";

/**
 * TalorData SERP API 클라이언트.
 * 문서: https://docs.talordata.com/serp-api
 *   POST https://serpapi.talordata.net/serp/v1/request
 *   Authorization: Bearer <TALORDATA_API_TOKEN>, form-urlencoded 본문
 * 응답의 organic 배열 순서가 곧 순위다 (API가 position 필드를 주지 않는다).
 */

const ENDPOINT = "https://serpapi.talordata.net/serp/v1/request";
const REQUEST_TIMEOUT_MS = 15_000;

export type SerpEngine = "google" | "bing";

export interface SerpQuery {
  q: string;
  engine?: SerpEngine;
  /** 가져올 오가닉 결과 수 (기본 10, 최대 100) */
  num?: number;
  /** 국가 코드 (gl). 기본 kr */
  gl?: string;
  /** UI 언어 (hl). 기본 ko */
  hl?: string;
  device?: "desktop" | "mobile";
}

export interface SerpOrganicItem {
  position: number;
  title: string;
  link: string;
  /** link 에서 추출한 정규화 도메인 (매칭 실패 시 빈 문자열) */
  domain: string;
  displayLink: string | null;
  description: string | null;
}

export interface SerpResult {
  query: string;
  engine: SerpEngine;
  organic: SerpOrganicItem[];
  /** 페이지에서 감지된 SERP 피처 이름 (local_pack, knowledge_panel 등) */
  features: string[];
  /** 제공사 원본 메타 (응답 id, 소요 시간) */
  provider: { id: string | null; timeTakenSeconds: number | null };
  capturedAt: Date;
}

interface TalordataOrganicRaw {
  title?: string;
  link?: string;
  display_link?: string;
  description?: string;
}

const FEATURE_KEYS: Record<string, string> = {
  google_ai_overview: "ai_overview",
  ai_overview: "ai_overview",
  snack_pack: "local_pack",
  snack_pack_map: "local_pack",
  knowledge: "knowledge_panel",
  answer_box: "answer_box",
  people_also_ask: "people_also_ask",
  people_are_saying: "people_are_saying",
  related_searches: "related_searches",
  refine_this_search: "refine_this_search",
  immersive_products: "shopping",
  shopping: "shopping",
  videos: "videos",
  images: "images",
  news: "top_stories",
};

function getToken(): string {
  const token = process.env.TALORDATA_API_TOKEN?.trim();
  if (!token) {
    throw new ApiError(
      "INTERNAL",
      "TALORDATA_API_TOKEN 이 설정되지 않았습니다. .env.local 에 토큰을 추가하세요."
    );
  }
  return token;
}

export async function fetchSerp(query: SerpQuery): Promise<SerpResult> {
  const token = getToken();
  const engine = query.engine ?? "google";
  const body = new URLSearchParams({
    engine,
    q: query.q,
    num: String(Math.min(100, Math.max(1, query.num ?? 10))),
    gl: (query.gl ?? "kr").toLowerCase(),
    hl: (query.hl ?? "ko").toLowerCase(),
    device: query.device ?? "desktop",
    json: "1",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "SERP 제공사 응답이 시간 초과되었습니다."
        : "SERP 제공사에 연결하지 못했습니다.",
      { details: error instanceof Error ? error.message : String(error) }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // 토큰 오류와 사용량 오류를 구분해 노출한다.
    if (response.status === 401 || response.status === 403) {
      throw new ApiError("INTERNAL", "SERP API 토큰이 유효하지 않습니다.");
    }
    if (response.status === 402 || response.status === 429) {
      throw new ApiError(
        "RATE_LIMITED",
        "SERP API 사용량 한도에 도달했습니다. 대시보드에서 잔량을 확인하세요."
      );
    }
    throw new ApiError("INTERNAL", `SERP 제공사가 HTTP ${response.status} 를 반환했습니다.`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  // 실제 응답 봉투: { code, data: {...}, task_id } — SERP 데이터는 data 아래에 있다.
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const metadata = data.search_metadata as
    | { id?: string; status?: string; total_time_taken?: number }
    | undefined;
  if (typeof payload.code === "number" && payload.code !== 0) {
    throw new ApiError(
      "INTERNAL",
      `SERP 수집이 실패했습니다: ${String(payload.message ?? payload.code)}`
    );
  }
  if (metadata?.status && metadata.status !== "Success") {
    throw new ApiError("INTERNAL", `SERP 수집이 실패했습니다: ${metadata.status}`);
  }

  const organicRaw = Array.isArray(data.organic)
    ? (data.organic as (TalordataOrganicRaw & { position?: number })[])
    : [];
  const organic: SerpOrganicItem[] = organicRaw
    .filter((item) => typeof item.link === "string" && item.link.length > 0)
    .map((item, index) => ({
      position:
        Number.isInteger(item.position) && (item.position as number) > 0
          ? (item.position as number)
          : index + 1,
      title: item.title ?? "",
      link: item.link!,
      domain: normalizeDomain(item.link!),
      displayLink: item.display_link ?? null,
      description: item.description ?? null,
    }));

  // 오가닉 0건은 "순위권 밖"이 아니라 제공사 차단/일시 오류 신호다.
  // 그대로 진행하면 순위가 null 로 덮여 이력이 오염되므로 실패로 돌린다.
  if (organic.length === 0) {
    throw new ApiError(
      "INTERNAL",
      "SERP 제공사가 빈 결과를 반환했습니다. 일시적 차단일 수 있으니 잠시 후 다시 시도하세요."
    );
  }

  const features = Object.entries(FEATURE_KEYS)
    .filter(([key]) => {
      const value = data[key];
      // google_ai_overview 같은 boolean 플래그와 배열/객체 피처를 모두 받는다.
      return value !== undefined && value !== null && value !== false;
    })
    .map(([, name]) => name);

  return {
    query: query.q,
    engine,
    organic,
    features: [...new Set(features)],
    provider: {
      id: metadata?.id ?? null,
      timeTakenSeconds: metadata?.total_time_taken ?? null,
    },
    capturedAt: new Date(),
  };
}
