import { z } from "zod";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { backlinkProviderSchema, backlinkReportRequestSchema, backlinkScopeSchema } from "@/server/backlinks/contracts";
import { readCachedBacklinkReport, refreshBacklinkReport } from "@/server/backlinks/service";

const querySchema = z.object({
  siteUrl: z.string().trim().min(1).max(2000),
  targetUrl: z.string().trim().max(2000).nullable().optional(),
  scope: backlinkScopeSchema.default("site"),
  provider: backlinkProviderSchema.optional(),
});

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const query = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ siteUrl: query.get("siteUrl") ?? query.get("target") ?? "",
    targetUrl: query.get("targetUrl"), scope: query.get("scope") === "page" ? "page" : "site",
    provider: query.get("provider") ?? undefined });
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "백링크 분석 대상을 확인해 주세요.");
  return jsonOk(await readCachedBacklinkReport(auth, parsed.data));
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const input = await parseBody(request, backlinkReportRequestSchema);
  const report = await refreshBacklinkReport(auth, input);
  return jsonOk(report, { meta: {
    source: report.provenance.provider,
    cacheTtlHours: report.provenance.provider === "common-crawl" ? 720 : 24,
  } });
});
