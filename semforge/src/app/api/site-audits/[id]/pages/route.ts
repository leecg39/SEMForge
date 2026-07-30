import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { siteAuditCampaigns, siteAuditPages } from "@/db/schema";
import { jsonOk, route } from "@/lib/api";
import { assertSameWorkspace } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** 캠페인의 최근 크롤에서 수집한 페이지 목록(상태 코드·제목·검사 항목)을 반환한다. */
export const GET = route(async (request: Request, context: Ctx) => {
  const auth = await requireAuth(request);
  const { id } = await context.params;

  const [campaign] = await db
    .select({ id: siteAuditCampaigns.id, workspaceId: siteAuditCampaigns.workspaceId })
    .from(siteAuditCampaigns)
    .where(and(eq(siteAuditCampaigns.id, id), isNull(siteAuditCampaigns.deletedAt)))
    .limit(1);
  assertSameWorkspace(auth, campaign, "사이트 진단 캠페인");

  const rows = await db
    .select({
      id: siteAuditPages.id,
      url: siteAuditPages.url,
      statusCode: siteAuditPages.statusCode,
      title: siteAuditPages.title,
      hasTitle: siteAuditPages.hasTitle,
      titleDup: siteAuditPages.titleDup,
      metaDescriptionPresent: siteAuditPages.metaDescriptionPresent,
      metaDup: siteAuditPages.metaDupKey,
      imagesTotal: siteAuditPages.imagesTotal,
      imagesMissingAlt: siteAuditPages.imagesMissingAlt,
      internalLinks: siteAuditPages.internalLinks,
      isHttps: siteAuditPages.isHttps,
      hasJsonLd: siteAuditPages.hasJsonLd,
      bytes: siteAuditPages.bytes,
      responseMs: siteAuditPages.responseMs,
      depth: siteAuditPages.depth,
    })
    .from(siteAuditPages)
    .where(eq(siteAuditPages.campaignId, campaign.id))
    .orderBy(asc(siteAuditPages.depth), asc(siteAuditPages.url));

  return jsonOk(
    rows.map((row) => ({ ...row, metaDup: row.metaDup !== null })),
    { meta: { total: rows.length } }
  );
});
