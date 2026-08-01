import { ApiError, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  getAdvertisingCampaign,
  markAdvertisingCampaignExported,
} from "@/server/advertising/campaigns";
import {
  advertisingCampaignCsv,
  advertisingCampaignJson,
  safeExportFilename,
} from "@/server/advertising/export";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  if (format !== "csv" && format !== "json") {
    throw new ApiError("VALIDATION_ERROR", "format은 csv 또는 json이어야 합니다.");
  }
  const campaign = await getAdvertisingCampaign(auth, id);
  const content =
    format === "csv" ? advertisingCampaignCsv(campaign) : advertisingCampaignJson(campaign);
  await markAdvertisingCampaignExported(auth, id);
  const filename = `${safeExportFilename(campaign.name)}.${format}`;
  return new Response(content, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
});

