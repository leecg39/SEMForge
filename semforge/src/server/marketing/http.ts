import { ApiError } from "@/lib/api";
import type { MarketingProvider } from "./contracts";

const PROVIDERS: MarketingProvider[] = ["gsc", "ga4", "google_ads", "meta_ads", "hubspot"];

export function requiredParam(request: Request, name: string): string {
  const value = new URL(request.url).searchParams.get(name)?.trim();
  if (!value) throw new ApiError("VALIDATION_ERROR", `${name} 파라미터가 필요합니다.`);
  return value;
}

export function marketingProvider(value: string): MarketingProvider {
  if (!PROVIDERS.includes(value as MarketingProvider)) throw new ApiError("VALIDATION_ERROR", "지원하지 않는 마케팅 공급자입니다.");
  return value as MarketingProvider;
}

export function trafficView(value: string | null): "overview" | "channels" | "pages" {
  if (!value) return "overview";
  if (!["overview", "channels", "pages"].includes(value)) throw new ApiError("VALIDATION_ERROR", "지원하지 않는 트래픽 보기입니다.");
  return value as "overview" | "channels" | "pages";
}
