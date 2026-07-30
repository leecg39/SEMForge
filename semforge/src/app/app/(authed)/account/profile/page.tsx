import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ProfileForm } from "@/components/crud/ProfileForm";
import { ROLE_LABELS } from "@/lib/rbac";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "프로필 설정 · SEMForge CRUD 클론" };

const formatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "long",
});

export default async function ProfilePage() {
  const { auth } = await pageSession();
  const [user] = await db
    .select({ name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold">프로필 설정</h1>
        <p className="mt-1 text-[12px] text-app-text-secondary">
          <span className="mr-2 inline-flex items-center rounded-[4px] bg-[#e6f5f0] px-1.5 py-[1px] font-semibold text-[#0a6b57]">
            증거 O
          </span>
          원본 필드 구성(성명·전화번호·회사·국가·시간대)과 명시적 저장 동작을 따릅니다.
        </p>
      </div>

      <div className="rounded-[8px] border border-app-border bg-white p-5">
        <dl className="grid grid-cols-1 gap-3 border-b border-app-border pb-4 sm:grid-cols-3">
          <div>
            <dt className="text-[12px] text-app-text-secondary">이메일</dt>
            <dd className="mt-0.5 text-[13px]">{user.email}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-app-text-secondary">회원가입 날짜</dt>
            <dd className="mt-0.5 text-[13px]">{formatter.format(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-app-text-secondary">역할</dt>
            <dd className="mt-0.5 text-[13px]">
              {ROLE_LABELS[auth.role]} · {auth.workspaceName}
            </dd>
          </div>
        </dl>
        <div className="pt-4">
          <ProfileForm initialName={user.name} />
        </div>
      </div>
    </div>
  );
}
