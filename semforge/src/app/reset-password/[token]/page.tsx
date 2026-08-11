// @TASK P1-F1-T1 - Password reset page
// @SPEC SEMForge paid beta plan#password-reset
import type { Metadata } from "next";
import { AuthForm } from "@/components/core-shell/auth-form";
import { AuthShell } from "@/components/core-shell/auth-shell";

export const metadata: Metadata = { title: "새 비밀번호 설정" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell
      eyebrow="계정 복구"
      title="새 비밀번호 설정"
      description="다른 서비스에서 사용하지 않는 12자 이상의 비밀번호를 설정해 주세요."
    >
      <AuthForm variant="reset" token={token} />
    </AuthShell>
  );
}
