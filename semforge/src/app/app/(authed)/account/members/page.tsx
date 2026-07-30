import { MembersManager } from "@/components/crud/MembersManager";
import { hasRole } from "@/lib/rbac";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "사용자 관리 · SEMForge CRUD 클론" };

export default async function MembersPage() {
  const { auth } = await pageSession();

  if (!hasRole(auth.role, "admin")) {
    return (
      <div className="rounded-[8px] border border-app-border bg-white p-8">
        <h1 className="text-[18px] font-semibold">사용자 관리 권한이 없습니다.</h1>
        <p className="mt-2 text-[13px] text-app-text-secondary">
          관리자 이상만 팀원을 초대하고 역할을 변경할 수 있습니다. 현재 역할: {auth.role}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold">사용자 관리</h1>
        <p className="mt-1 text-[12px] text-app-text-secondary">
          <span className="mr-2 inline-flex items-center rounded-[4px] bg-app-link-soft px-1.5 py-[1px] font-semibold text-app-link">
            증거 P
          </span>
          원본은 무료 플랜에서 초대 버튼이 동작하지 않아 역할 목록을 확인하지 못했습니다. 4단계 역할
          체계는 제안입니다.
        </p>
      </div>
      <MembersManager currentRole={auth.role} currentUserId={auth.userId} />
    </div>
  );
}
