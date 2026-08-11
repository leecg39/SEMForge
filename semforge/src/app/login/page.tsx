// @TASK P1-F1-T1 - Login page
// @SPEC SEMForge paid beta plan#invite-only-auth
// @TEST src/components/core-shell/allowed-pages.test.ts
import type { Metadata } from "next";
import { AuthForm } from "@/components/core-shell/auth-form";
import { AuthShell } from "@/components/core-shell/auth-shell";

export const metadata: Metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="계정 로그인"
      title="계정에 로그인"
      description="초대를 수락한 대행사 계정으로 주간 가시성 워크스페이스에 접속하세요."
    >
      <AuthForm variant="login" />
    </AuthShell>
  );
}
