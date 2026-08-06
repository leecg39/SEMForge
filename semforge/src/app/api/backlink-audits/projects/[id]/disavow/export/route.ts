import { route } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";
import { recordDisavowExport } from "@/server/backlink-audit/disavow";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  assertCan(auth, "export");
  const { id } = await context.params;
  const preview = await recordDisavowExport(auth, id);
  return new Response(preview.content, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="semforge-disavow-${new URL(preview.siteUrl).hostname}.txt"`,
      "cache-control": "no-store",
    },
  });
});
