import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { siteAuditCampaigns, siteAuditIssues } from "@/db/schema";
import { jsonOk, route } from "@/lib/api";
import { assertSameWorkspace } from "@/lib/rbac";
import { requireAuth } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** 캠페인의 최근 크롤 이슈(심각도/제목/건수/페이지 URL 목록)를 반환한다. */
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
      id: siteAuditIssues.id,
      severity: siteAuditIssues.severity,
      title: siteAuditIssues.title,
      count: siteAuditIssues.count,
      details: siteAuditIssues.details,
      status: siteAuditIssues.status,
    })
    .from(siteAuditIssues)
    .where(eq(siteAuditIssues.campaignId, campaign.id));

  const rank = { error: 0, warning: 1, notice: 2 } as const;
  const issues = rows
    .map((row) => ({
      ...row,
      pages: parseDetails(row.details),
    }))
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);

  return jsonOk(issues, {
    meta: {
      totals: {
        errors: issues.filter((i) => i.severity === "error").reduce((s, i) => s + i.count, 0),
        warnings: issues
          .filter((i) => i.severity === "warning")
          .reduce((s, i) => s + i.count, 0),
        notices: issues
          .filter((i) => i.severity === "notice")
          .reduce((s, i) => s + i.count, 0),
      },
    },
  });
});

function parseDetails(details: string | null): string[] {
  if (!details) return [];
  try {
    const parsed: unknown = JSON.parse(details);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
