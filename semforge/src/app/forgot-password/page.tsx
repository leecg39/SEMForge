// @TASK P1-F1-T1 - Forgot password page
// @SPEC SEMForge paid beta plan#password-reset
import type { Metadata } from "next";
import { AuthForm } from "@/components/core-shell/auth-form";
import { AuthShell } from "@/components/core-shell/auth-shell";

export const metadata: Metadata = { title: "비밀번호 재설정 요청" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="계정 복구"
      title="비밀번호 재설정"
      description="가입할 때 사용한 이메일로 1회용 재설정 안내를 보내드립니다."
    >
      <AuthForm variant="forgot" />
    </AuthShell>
  );
}
