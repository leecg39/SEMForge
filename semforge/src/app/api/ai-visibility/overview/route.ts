import { z } from "zod";
import { ApiError, jsonOk, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  getProjectAiVisibilityDashboard,
  type AiVisibilityRange,
  type AiVisibilityTab,
} from "@/server/ai-visibility/dashboard";
import type { AiVisibilityProvider } from "@/db/schema";

const providerSchema = z.enum(["google_aio", "chatgpt_web", "gemini_grounded"]);
const rangeSchema = z.enum(["1m", "6m", "all"]);
const tabSchema = z.enum([
  "top_topics",
  "topic_opportunities",
  "cited_sources",
  "source_opportunities",
  "cited_pages",
]);

function csvValues(value: string | null): string[] | undefined {
  const result = value?.split(",").map((item) => item.trim()).filter(Boolean);
  return result?.length ? [...new Set(result)] : undefined;
}

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const search = new URL(request.url).searchParams;
  const fid = search.get("fid")?.trim();
  if (!fid) throw new ApiError("VALIDATION_ERROR", "fid 파라미터가 필요합니다.");
  const rawProviders = csvValues(search.get("providers"));
  const providers = rawProviders?.map((value) => providerSchema.parse(value)) as AiVisibilityProvider[] | undefined;
  const range = rangeSchema.parse(search.get("range") || "1m") as AiVisibilityRange;
  const tab = tabSchema.parse(search.get("tab") || "top_topics") as AiVisibilityTab;
  const page = Number(search.get("page") || 1);
  const overview = await getProjectAiVisibilityDashboard(auth, fid, {
    countries: csvValues(search.get("countries")),
    providers,
    range,
    tab,
    q: search.get("q") ?? undefined,
    page: Number.isFinite(page) ? page : 1,
  });
  return jsonOk(overview);
});
