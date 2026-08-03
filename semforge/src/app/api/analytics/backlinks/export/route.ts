import { parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { backlinkExportRequestSchema } from "@/server/backlinks/contracts";
import { backlinkExportUnitEstimate } from "@/server/backlinks/semrush";
import { backlinkRowsCsv, queryBacklinkList } from "@/server/backlinks/service";

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "export");
  const input = await parseBody(request, backlinkExportRequestSchema);
  const result = await queryBacklinkList(auth, {
    target: input.target,
    scope: input.scope,
    dataset: input.dataset,
    page: 1,
    pageSize: input.limit,
    sort: input.sort,
    direction: input.direction,
    filters: input.filters,
  });
  const csv = backlinkRowsCsv(result.rows);
  return new Response(`\ufeff${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="backlinks-${input.dataset}-${Date.now()}.csv"`,
      "X-Estimated-Api-Units": String(backlinkExportUnitEstimate(input.dataset, input.limit)),
      "X-Data-Source": "semrush-v4",
    },
  });
});

