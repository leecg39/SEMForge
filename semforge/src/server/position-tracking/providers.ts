import { ApiError } from "@/lib/api";
import type { TrackingLocation } from "@/lib/position-tracking/locations";
import { matchesTrackingTarget, type TrackingTargetType } from "@/lib/position-tracking/targets";
import {
  collectAiSearchObservation,
  getAiSearchCapabilities,
} from "@/server/ai-search/providers";
import { fetchSerp } from "@/server/talordata/client";

export type TrackingEngine = "google" | "bing" | "chatgpt" | "gemini";

export interface TrackingProviderInput {
  keyword: string;
  engine: TrackingEngine;
  device: "desktop" | "mobile" | "tablet";
  targetType: TrackingTargetType;
  targetValue: string;
  businessName?: string | null;
  location: TrackingLocation;
}

export interface TrackingObservationResult {
  measurementKind: "organic_rank" | "citation_rank";
  position: number | null;
  url: string | null;
  mentioned: boolean;
  localPackPosition: number | null;
  features: string[];
  citations: { position: number; url: string; title: string | null }[];
  source: "talordata" | "openai" | "gemini" | "chatmock";
  capturedAt: Date;
}

export interface PositionTrackingCapabilities {
  engines: Record<TrackingEngine, { enabled: boolean; reason: string | null }>;
  devices: {
    desktop: { enabled: boolean; reason: string | null };
    mobile: { enabled: boolean; reason: string | null };
    tablet: { enabled: boolean; reason: string | null };
  };
}

export function getPositionTrackingCapabilities(): PositionTrackingCapabilities {
  const hasTalordata = Boolean(process.env.TALORDATA_API_TOKEN?.trim());
  const aiCapabilities = getAiSearchCapabilities();
  const tabletEnabled = process.env.POSITION_TRACKING_TABLET_ENABLED === "true";
  return {
    engines: {
      google: { enabled: hasTalordata, reason: hasTalordata ? null : "TALORDATA_API_TOKEN이 필요합니다." },
      bing: { enabled: hasTalordata, reason: hasTalordata ? null : "TALORDATA_API_TOKEN이 필요합니다." },
      chatgpt: aiCapabilities.providers.chatgpt_web,
      gemini: aiCapabilities.providers.gemini_grounded,
    },
    devices: {
      desktop: { enabled: true, reason: null },
      mobile: { enabled: true, reason: null },
      tablet: {
        enabled: tabletEnabled,
        reason: tabletEnabled ? null : "공급자 태블릿 계약 테스트를 통과한 환경에서만 사용할 수 있습니다.",
      },
    },
  };
}

function normalizedText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function localBusinessPosition(
  localResults: { position: number; title: string }[],
  businessName?: string | null
): number | null {
  const target = normalizedText(businessName ?? "");
  if (!target) return null;
  const found = localResults.find((item) => {
    const title = normalizedText(item.title);
    return title.includes(target) || target.includes(title);
  });
  return found?.position ?? null;
}

async function collectSearchEngine(input: TrackingProviderInput): Promise<TrackingObservationResult> {
  if (input.device === "tablet" && !getPositionTrackingCapabilities().devices.tablet.enabled) {
    throw new ApiError("VALIDATION_ERROR", "태블릿 수집은 현재 환경에서 활성화되지 않았습니다.");
  }
  const serp = await fetchSerp({
    q: input.keyword,
    engine: input.engine as "google" | "bing",
    num: 100,
    gl: input.location.countryCode,
    hl: input.location.languageCode,
    device: input.device,
    location: input.location.googleLocation,
    ...(input.engine === "google"
      ? { uule: input.location.googleUule }
      : { latitude: input.location.latitude, longitude: input.location.longitude }),
  });
  const found = serp.organic.find((item) =>
    matchesTrackingTarget(item.link, input.targetType, input.targetValue)
  );
  return {
    measurementKind: "organic_rank",
    position: found?.position ?? null,
    url: found?.link ?? null,
    mentioned: false,
    localPackPosition: localBusinessPosition(serp.localResults, input.businessName),
    features: serp.features,
    citations: [],
    source: "talordata",
    capturedAt: serp.capturedAt,
  };
}

async function collectAiEngine(
  input: TrackingProviderInput,
): Promise<TrackingObservationResult> {
  const observation = await collectAiSearchObservation({
    provider: input.engine === "chatgpt" ? "chatgpt_web" : "gemini_grounded",
    prompt: input.keyword,
    brandNames: input.businessName ? [input.businessName] : [],
    targetDomain: input.targetValue,
    location: input.location,
  });
  const found = observation.citations.find((citation) =>
    matchesTrackingTarget(citation.url, input.targetType, input.targetValue)
  );
  return {
    measurementKind: "citation_rank",
    position: found?.position ?? null,
    url: found?.url ?? null,
    mentioned: observation.brandMentioned === true,
    localPackPosition: null,
    features: [input.engine === "chatgpt" ? "web_search" : "google_search_grounding"],
    citations: observation.citations.map(({ position, url, title }) => ({
      position,
      url,
      title,
    })),
    source: observation.source,
    capturedAt: observation.capturedAt,
  };
}

export async function collectTrackingObservation(
  input: TrackingProviderInput
): Promise<TrackingObservationResult> {
  const capability = getPositionTrackingCapabilities().engines[input.engine];
  if (!capability.enabled) throw new ApiError("VALIDATION_ERROR", capability.reason ?? "지원하지 않는 검색 엔진입니다.");
  if (input.engine === "google" || input.engine === "bing") return collectSearchEngine(input);
  return collectAiEngine(input);
}
