import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { authEvents } from "@/db/schema";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "활동 로그 · Semrush CRUD 클론" };

const formatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "short",
  timeStyle: "medium",
  hour12: false,
});

/**
 * 인증 활동 로그.
 * 원본 `/accounts/activities/` 의 컬럼(날짜 및 시간 / 이벤트 유형 / IP / 국가 / 사용자 에이전트)을
 * 그대로 재현한다. 원본은 폴더 CRUD를 기록하지 않았으므로 여기에도 남기지 않는다. (증거 O)
 */
export default async function ActivitiesPage() {
  const { auth } = await pageSession();
  const rows = await db
    .select()
    .from(authEvents)
    .where(eq(authEvents.userId, auth.userId))
    .orderBy(desc(authEvents.occurredAt))
    .limit(50);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold">활동 로그</h1>
        <p className="mt-1 text-[12px] text-app-text-secondary">
          <span className="mr-2 inline-flex items-center rounded-[4px] bg-[#e6f5f0] px-1.5 py-[1px] font-semibold text-[#0a6b57]">
            증거 O
          </span>
          원본과 동일하게 인증·계정 이벤트만 기록합니다. 데이터 변경 이력은 감사 로그에서 봅니다.
        </p>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-app-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-app-border bg-[#f9fafb]">
                {["날짜 및 시간", "이벤트 유형", "IP", "국가", "사용자 에이전트"].map((label) => (
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-[13px] text-app-text-secondary">
                    아직 기록이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f9fafb]">
                    <td className="whitespace-nowrap border-b border-[#eef0f2] px-4 py-3 text-[13px] tabular-nums">
                      {formatter.format(row.occurredAt)}
                    </td>
                    <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px] font-mono">
                      {row.eventType}
                    </td>
                    <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px]">
                      {row.ip ?? "—"}
                    </td>
                    <td className="border-b border-[#eef0f2] px-4 py-3 text-[13px]">
                      {row.country ?? "—"}
                    </td>
                    <td className="max-w-[380px] truncate border-b border-[#eef0f2] px-4 py-3 text-[12px] text-app-text-secondary">
                      {row.userAgent ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
