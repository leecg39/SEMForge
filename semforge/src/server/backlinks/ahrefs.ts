import { ApiError } from "@/lib/api";

const ENDPOINT = "https://api.ahrefs.com/v3/public/domain-rating-free";
export const AHREFS_ATTRIBUTION = "Domain Rating by Ahrefs" as const;
export const AHREFS_LICENSE_URL = "https://ahrefs.com/legal/domain-rating-license";

export interface AhrefsDomainRating {
  value: number;
  licenseUrl: string;
}

export class AhrefsDomainRatingProvider {
  private readonly apiKey: string;

  constructor(options: { apiKey?: string; fetchImpl?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? process.env.AHREFS_API_KEY?.trim() ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private readonly fetchImpl: typeof fetch;

  async get(target: string): Promise<AhrefsDomainRating> {
    if (!this.apiKey) {
      throw new ApiError("INTERNAL", "Ahrefs 무료 API 키가 설정되지 않아 Domain Rating을 표시할 수 없습니다.", {
        details: { provider: "ahrefs-domain-rating", providerReason: "configuration" },
      });
    }
    const url = new URL(ENDPOINT);
    url.searchParams.set("target", target);
    url.searchParams.set("output", "json");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.fetchImpl(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
        cache: "no-store",
      });
      const raw: unknown = await response.json().catch(() => null);
      if (response.status === 429) throw new ApiError("RATE_LIMITED", "Ahrefs Domain Rating 요청이 너무 많습니다.");
      if (response.status === 401 || response.status === 403) throw new ApiError("UNAUTHENTICATED", "Ahrefs 무료 API 키를 확인해 주세요.");
      if (!response.ok || !raw || typeof raw !== "object") throw new ApiError("INTERNAL", "Ahrefs Domain Rating을 불러오지 못했습니다.");
      const domainRating = (raw as { domain_rating?: unknown }).domain_rating;
      if (!domainRating || typeof domainRating !== "object") throw new ApiError("INTERNAL", "Ahrefs 응답 형식이 변경되었습니다.");
      const value = (domainRating as { domain_rating?: unknown }).domain_rating;
      const license = (domainRating as { license?: unknown }).license;
      if (typeof value !== "number" || !Number.isFinite(value)) throw new ApiError("INTERNAL", "Ahrefs가 유효한 Domain Rating을 반환하지 않았습니다.");
      return { value, licenseUrl: typeof license === "string" ? license : AHREFS_LICENSE_URL };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("INTERNAL", controller.signal.aborted
        ? "Ahrefs Domain Rating 응답이 시간 초과되었습니다."
        : "Ahrefs Domain Rating에 연결하지 못했습니다.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
