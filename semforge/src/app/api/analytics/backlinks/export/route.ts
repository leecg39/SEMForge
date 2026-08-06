import { parseBody, route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { backlinkExportRequestSchema } from "@/server/backlinks/contracts";
import { exportBacklinkCsv } from "@/server/backlinks/service";

export const POST = route(async (request: Request) => {
  const auth = await requireAuth(request);
  assertCan(auth, "export");
  const input = await parseBody(request, backlinkExportRequestSchema);
  const csv = await exportBacklinkCsv(auth, input);
  return new Response(`\ufeff${csv}`, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="backlinks-${input.dataset}-${Date.now()}.csv"`,
    "X-Data-Source": input.provider,
  }});
});
