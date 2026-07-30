import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { hasRole } from "@/lib/rbac";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "감사 로그 · SEMForge CRUD 클론" };

const formatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "medium",
});

const ACTION_LABELS: Record<string, string> = {
  create: "생성",
  update: "수정",
  delete: "삭제",
  restore: "복구",
  purge: "영구 삭제",
  bulk_delete: "일괄 삭제",
  bulk_restore: "일괄 복구",
  bulk_update: "일괄 수정",
  export: "내보내기",
  login: "로그인",
  login_failed: "로그인 실패",
  logout: "로그아웃",
  permission_denied: "권한 거부",
};

const ACTION_TONE: Record<string, string> = {
  create: "bg-[#e6f5f0] text-[#0a6b57]",
  update: "bg-app-link-soft text-app-link",
  delete: "bg-[#fff0e6] text-[#a34c12]",
  purge: "bg-[#fdecef] text-[#a4002a]",
  restore: "bg-[#e6f5f0] text-[#0a6b57]",
};

/**
 * 엔티티 감사 로그 (제안 기능).
 * 원본 활동 로그는 인증 이벤트만 기록했고 폴더 CRUD는 남지 않았다(증거 O).
 * 관리자 이상만 열람한다.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entityType?: string }>;
}) {
  const { auth } = await pageSession();
  const params = await searchParams;

  if (!hasRole(auth.role, "admin")) {
    return (
      <div className="p-6">
        <div className="rounded-[8px] border border-app-border bg-white p-8">
          <h1 className="text-[18px] font-semibold">감사 로그를 볼 권한이 없습니다.</h1>
          <p className="mt-2 text-[13px] text-app-text-secondary">
            관리자 이상만 조회할 수 있습니다. 현재 역할: {auth.role}
          </p>
        </div>
      </div>
    );
  }

  const conditions = [eq(auditLogs.workspaceId, auth.workspaceId)];
  if (params.action) {
    conditions.push(eq(auditLogs.action, params.action as never));
  }
  if (params.entityType) {
    conditions.push(eq(auditLogs.entityType, params.entityType));
  }

  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-[20px] font-semibold">감사 로그</h1>
        <p className="mt-1 text-[12px] text-app-text-secondary">
          <span className="mr-2 inline-flex items-center rounded-[4px] bg-app-link-soft px-1.5 py-[1px] font-semibold text-app-link">
            증거 P
          </span>
          원본의 활동 로그는 인증 이벤트 전용이라, 데이터 변경 추적은 이 화면으로 분리했습니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-[8px] border border-app-border bg-white px-3 py-2.5 text-[13px]">
        <span className="text-app-text-secondary">액션 필터</span>
        {["", "create", "update", "delete", "restore", "purge", "export"].map((action) => (
          <a
            key={action || "all"}
            href={`/app/audit/${action ? `?action=${action}` : ""}`}
            className={
              (params.action ?? "") === action
                ? "rounded-[6px] bg-[#1b1f23] px-2 py-1 font-medium text-white"
                : "rounded-[6px] border border-app-border px-2 py-1"
            }
          >
            {action ? ACTION_LABELS[action] : "전체"}
          </a>
        ))}
      </div>

      <div className="overflow-hidden rounded-[8px] border border-app-border bg-white">
        {rows.length === 0 ? (
          <div className="p-8">
            <p className="text-[14px] font-semibold">기록이 없습니다.</p>
            <p className="mt-1 text-[13px] text-app-text-secondary">
              생성·수정·삭제·복구 작업을 하면 여기에 남습니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-app-border bg-[#f9fafb]">
                  {["시각", "행위자", "액션", "엔티티", "대상", "IP"].map((label) => (
                    <th
                      key={label}
                      className="whitespace-nowrap px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-app-text-secondary"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f9fafb]">
                    <td className="whitespace-nowrap border-b border-[#eef0f2] px-4 py-3 text-[13px] tabular-nums">
                      {formatter.format(row.createdAt)}
                    </td>
                    <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px]">
                      {row.actorEmail ?? "시스템"}
                    </td>
                    <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px]">
                      <span
                        className={`inline-flex items-center rounded-[4px] px-2 py-[2px] text-[12px] font-medium ${
                          ACTION_TONE[row.action] ?? "bg-app-bg text-app-text-secondary"
                        }`}
                      >
                        {ACTION_LABELS[row.action] ?? row.action}
                      </span>
                    </td>
                    <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px] text-app-text-secondary">
                      {row.entityType}
                    </td>
                    <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px] font-medium">
                      {row.entityLabel ?? "—"}
                    </td>
                    <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px] text-app-text-secondary">
                      {row.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
