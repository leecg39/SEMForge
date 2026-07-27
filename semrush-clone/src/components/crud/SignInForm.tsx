"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientApiError, api } from "@/lib/client-api";

const SEEDED = [
  { email: "owner@example.com", label: "소유자" },
  { email: "admin@example.com", label: "관리자" },
  { email: "editor@example.com", label: "편집자" },
  { email: "viewer@example.com", label: "조회자" },
];

/**
 * 로그인 폼.
 * 원본 signup/login 화면의 앱 디자인 시스템(다크 버튼, 6px radius, 40px 높이)을 따른다.
 */
export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@example.com");
  const [password, setPassword] = useState("password1234");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    try {
      await api.post("/api/auth/login/", { email, password });
      router.push("/app/home/");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ClientApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError("로그인에 실패했습니다.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex h-[64px] items-center px-6">
        <span className="text-[18px] font-semibold">Semrush</span>
        <span className="ml-2 text-[12px] text-app-text-secondary">CRUD 재구축 클론</span>
      </header>

      <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-6 pb-20">
        <h1 className="text-[26px] font-semibold leading-[1.2] text-app-text">로그인</h1>
        <p className="mt-2 text-[13px] text-app-text-secondary">
          시드 계정으로 역할별 권한 차이를 확인할 수 있습니다.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[13px] font-medium">
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              autoComplete="username"
              aria-invalid={Boolean(fields.email)}
              onChange={(e) => setEmail(e.target.value)}
              className="h-[40px] rounded-[6px] border border-app-border px-3 text-[14px] outline-none focus:border-app-link"
            />
            {fields.email && (
              <p className="text-[12px] text-app-red">{fields.email}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-[13px] font-medium">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              autoComplete="current-password"
              aria-invalid={Boolean(fields.password)}
              onChange={(e) => setPassword(e.target.value)}
              className="h-[40px] rounded-[6px] border border-app-border px-3 text-[14px] outline-none focus:border-app-link"
            />
            {fields.password && (
              <p className="text-[12px] text-app-red">{fields.password}</p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-[6px] bg-[#fdecef] px-3 py-2 text-[13px] text-app-red">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="h-[40px] rounded-[6px] bg-[#1b1f23] text-[14px] font-medium text-white transition-opacity disabled:opacity-60"
          >
            {pending ? "로그인 중…" : "로그인"}
          </button>
        </form>

        <div className="mt-8 rounded-[8px] border border-app-border bg-app-bg p-4">
          <p className="text-[12px] font-semibold text-app-text">시드 계정 (비밀번호: password1234)</p>
          <ul className="mt-2 flex flex-col gap-1">
            {SEEDED.map((account) => (
              <li key={account.email} className="flex items-center justify-between text-[12px]">
                <span className="text-app-text-secondary">{account.label}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword("password1234");
                  }}
                  className="font-medium text-app-link hover:underline"
                >
                  {account.email}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
