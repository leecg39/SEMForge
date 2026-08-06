import type { AuthContext } from "@/lib/session";
import { ApiError } from "@/lib/api";
import { marketingFlags } from "./config";
import { marketingIntelligence } from "./runtime";
import { attachMarketingReportAsset, getMarketingReportSnapshot, saveMarketingReportSnapshot } from "./store";
import { renderMarketingSnapshotPdf } from "./report-pdf";
import { saveMarketingReportPdf } from "./report-assets";

export async function createMarketingSnapshot(auth: AuthContext, input: {
  folderId: string; from: string; to: string; type: "marketing_overview" | "attribution";
}) {
  if (input.type === "attribution" && !marketingFlags.crm()) {
    throw new ApiError("FORBIDDEN", "CRM 귀속 보고서 기능이 비활성화되어 있습니다.");
  }
  const section = input.type === "attribution"
    ? await marketingIntelligence().getAttributionReport(auth, input.folderId, { from: input.from, to: input.to })
    : await marketingIntelligence().getTrafficReport(auth, input.folderId, { from: input.from, to: input.to, view: "overview" });
  if (section.status !== "live" || !section.data) throw new ApiError("NOT_FOUND", section.reason ?? "보고서로 고정할 데이터가 없습니다.");
  const id = await saveMarketingReportSnapshot({
    workspaceId: auth.workspaceId, folderId: input.folderId, reportType: input.type,
    rangeFrom: input.from, rangeTo: input.to, payload: section,
    provenance: { source: section.source, fetchedAt: section.fetchedAt, expiresAt: section.expiresAt, cache: section.cache, measurement: section.measurement },
    createdBy: auth.userId,
  });
  return { id };
}

export async function renderStoredMarketingPdf(auth: AuthContext, id: string) {
  if (!marketingFlags.reportPdf()) throw new ApiError("FORBIDDEN", "마케팅 PDF 보고서 기능이 비활성화되어 있습니다.");
  const row = await getMarketingReportSnapshot(auth.workspaceId, id);
  if (!row) throw new ApiError("NOT_FOUND", "보고서 스냅샷을 찾을 수 없습니다.");
  const bytes = await renderMarketingSnapshotPdf({
    id: row.id, reportType: row.reportType, rangeFrom: row.rangeFrom, rangeTo: row.rangeTo,
    createdAt: row.createdAt, payload: JSON.parse(row.payload), provenance: JSON.parse(row.provenance),
  });
  const key = await saveMarketingReportPdf(row.id, bytes);
  await attachMarketingReportAsset(auth.workspaceId, row.id, key);
  return { downloadUrl: `/api/marketing/reports/snapshots/${encodeURIComponent(row.id)}/file/` };
}
