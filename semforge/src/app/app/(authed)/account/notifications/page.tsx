import { NotificationToggles } from "@/components/crud/NotificationToggles";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "알림 · SEMForge CRUD 클론" };

export default async function NotificationsPage() {
  const { auth } = await pageSession();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold">이메일 알림</h1>
        <p className="mt-1 text-[12px] text-app-text-secondary">
          <span className="mr-2 inline-flex items-center rounded-[4px] bg-[#e6f5f0] px-1.5 py-[1px] font-semibold text-[#0a6b57]">
            증거 O
          </span>
          원본과 동일하게 저장 버튼 없이 토글 즉시 반영됩니다. 항목 3개도 원본과 같습니다.
        </p>
      </div>
      <NotificationToggles email={auth.email} />
    </div>
  );
}
