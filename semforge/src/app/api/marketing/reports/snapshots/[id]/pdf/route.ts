import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { renderStoredMarketingPdf } from "@/server/marketing/reports";

export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  return jsonOk(await renderStoredMarketingPdf(auth, id));
});
