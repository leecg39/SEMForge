import { route, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { readMarketingReportPdf } from "@/server/marketing/report-assets";
import { getMarketingReportSnapshot } from "@/server/marketing/store";

export const GET = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  const row = await getMarketingReportSnapshot(auth.workspaceId, id);
  if (!row?.assetPath) throw new ApiError("NOT_FOUND", "생성된 PDF 자산을 찾을 수 없습니다.");
  const bytes = await readMarketingReportPdf(row.assetPath);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="semforge-${id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
