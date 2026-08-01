import { z } from "zod";
import type { AiVisibilityProvider } from "@/db/schema";
import { ApiError, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  getProjectAiVisibilityDashboard,
  type AiVisibilityRange,
  type AiVisibilityTab,
} from "@/server/ai-visibility/dashboard";

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

function escapeCsv(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const search = new URL(request.url).searchParams;
  const fid = search.get("fid")?.trim();
  if (!fid) throw new ApiError("VALIDATION_ERROR", "fid 파라미터가 필요합니다.");
  const rawProviders = csvValues(search.get("providers"));
  const dashboard = await getProjectAiVisibilityDashboard(auth, fid, {
    countries: csvValues(search.get("countries")),
    providers: rawProviders?.map((value) => providerSchema.parse(value)) as AiVisibilityProvider[] | undefined,
    range: rangeSchema.parse(search.get("range") || "1m") as AiVisibilityRange,
    tab: tabSchema.parse(search.get("tab") || "top_topics") as AiVisibilityTab,
    q: search.get("q") ?? undefined,
    page: 1,
    pageSize: 100,
  });
  const header = ["항목", "설명", "가시성(%)", "언급", "자사 인용", "인용 페이지", "관측 수", "Google 검색 수요", "플랫폼", "국가"];
  const rows = dashboard.table.rows.map((row) => [
    row.label,
    row.detail,
    row.visibility,
    row.mentions,
    row.citations,
    row.citedPages,
    row.count,
    row.googleDemand,
    row.providers.join("|"),
    row.countries.join("|"),
  ]);
  const body = `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-visibility-${dashboard.scope.domain}-${dashboard.table.tab}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
