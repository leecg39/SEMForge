import { z } from "zod";
import { ApiError, jsonOk, parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import {
  backlinkReportRequestSchema,
  backlinkScopeSchema,
} from "@/server/backlinks/contracts";
import {
  readCachedBacklinkReport,
  refreshBacklinkReport,
} from "@/server/backlinks/service";

const querySchema = z.object({
  target: z.string().trim().min(1).max(2000),
  scope: backlinkScopeSchema.default("root_domain"),
});

export const GET = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "read");
  const query = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    target: query.get("target") ?? "",
    scope: query.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "백링크 분석 대상을 확인해 주세요.", {
      fields: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join(".") || "_root", issue.message])),
    });
  }
  return jsonOk(await readCachedBacklinkReport(auth, parsed.data.target, parsed.data.scope));
});

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "create");
  const input = await parseBody(request, backlinkReportRequestSchema);
  return jsonOk(await refreshBacklinkReport(auth, input), {
    meta: { source: "semrush-v4", billed: "cache-miss-or-force-only" },
  });
});

