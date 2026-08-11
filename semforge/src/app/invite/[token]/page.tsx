// @TASK P1-F1-T1 - Invite acceptance page
// @SPEC SEMForge paid beta plan#invite-only-auth
import type { Metadata } from "next";
import { AuthForm } from "@/components/core-shell/auth-form";
import { AuthShell } from "@/components/core-shell/auth-shell";

export const metadata: Metadata = { title: "초대 수락" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell
      eyebrow="7일 유효 · 1회용 초대"
      title="SEMForge 시작하기"
      description="담당자 이름과 안전한 비밀번호를 설정하면 초대된 워크스페이스가 준비됩니다."
    >
      <AuthForm variant="invite" token={token} />
    </AuthShell>
  );
}
