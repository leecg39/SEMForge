"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientApiError, api } from "@/lib/client-api";
import type { Dictionary } from "@/i18n/dictionaries";
import type { AuthPageData } from "@/types/templates";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function SsoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

const socialButtonCls =
  "flex h-10 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[6px] border border-[#d1d2d5] bg-white text-[14px] font-medium text-[#181e15] transition-colors duration-200 ease-in-out hover:bg-[#f7f8f8]";

export function AuthTemplate({
  data,
  dict,
}: {
  data: AuthPageData;
  dict: Dictionary;
}) {
  const router = useRouter();
  const isSignup = data.mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    setNotice(null);
    try {
      await api.post(isSignup ? "/api/auth/signup/" : "/api/auth/login/", {
        email,
        password,
      });
      // 인증 후에는 원본과 같은 경로(/home/)로 이동한다. 이 경로는 세션이 있으면 실제 폴더 화면을 렌더한다.
      router.push("/home/");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ClientApiError) {
        setFormError(caught.message);
        setFieldErrors(caught.fields ?? {});
      } else {
        setFormError(dict.auth.genericError);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7fbfa]">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <Link
          href="/"
          className="font-[family-name:var(--font-lazzer)] text-[20px] font-semibold tracking-[-0.4px] text-[#181e15]"
        >
          SEMForge
        </Link>
        <div className="text-[14px] text-[#6c6e79]">
          <span className="hidden sm:inline">{data.altPrompt.text} </span>
          <Link
            href={data.altPrompt.href}
            className="font-semibold text-[#181e15] underline underline-offset-2 hover:no-underline"
          >
            {data.altPrompt.linkLabel}
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] rounded-[12px] border border-[#e0e1e9] bg-white p-10 shadow-sm">
          <h1 className="font-[family-name:var(--font-lazzer)] text-[26px] font-semibold text-[#181e15]">
            {data.title}
          </h1>
          {data.subtitle && (
            <p className="mt-1.5 text-[14px] leading-[1.5] text-[#6c6e79]">
              {data.subtitle}
            </p>
          )}

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="auth-email"
                className="text-[13px] font-semibold text-[#181e15]"
              >
                {dict.auth.email}
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
                placeholder={dict.auth.emailPlaceholder}
                className="h-10 w-full rounded-[6px] border border-[#d1d2d5] px-3 text-[14px] text-[#181e15] outline-none transition-colors duration-200 ease-in-out placeholder:text-[#9a9ca5] focus:border-[#008ff8] aria-[invalid=true]:border-[#d1002f]"
              />
              {fieldErrors.email && (
                <p className="text-[12px] text-[#d1002f]">{fieldErrors.email}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="auth-password"
                className="text-[13px] font-semibold text-[#181e15]"
              >
                {dict.auth.password}
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(fieldErrors.password)}
                placeholder={dict.auth.passwordPlaceholder}
                className="h-10 w-full rounded-[6px] border border-[#d1d2d5] px-3 text-[14px] text-[#181e15] outline-none transition-colors duration-200 ease-in-out placeholder:text-[#9a9ca5] focus:border-[#008ff8] aria-[invalid=true]:border-[#d1002f]"
              />
              {fieldErrors.password && (
                <p className="text-[12px] text-[#d1002f]">{fieldErrors.password}</p>
              )}
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-[6px] bg-[#fdecef] px-3 py-2 text-[13px] text-[#d1002f]"
              >
                {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="h-10 w-full cursor-pointer rounded-[6px] bg-[#181e15] text-[14px] font-semibold text-white transition-colors duration-200 ease-in-out hover:bg-[#2a2f27] disabled:cursor-default disabled:opacity-60"
            >
              {pending ? dict.auth.processing : data.submitLabel}
            </button>

            {!isSignup && (
              <p className="text-center text-[12px] text-[#6c6e79]">
                {dict.auth.seedHint}
              </p>
            )}
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#e0e1e9]" />
            <span className="text-[12px] uppercase text-[#6c6e79]">{dict.auth.or}</span>
            <span className="h-px flex-1 bg-[#e0e1e9]" />
          </div>

          {/* 소셜/SSO 는 외부 IdP 연동이 필요해 이 클론의 범위 밖이다.
              조용히 아무 일도 하지 않는 대신 이유를 알려준다. */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() =>
                setNotice(dict.auth.unsupportedSocial)
              }
              className={socialButtonCls}
            >
              <GoogleIcon />
              {dict.auth.continueWithGoogle}
            </button>
            <button
              type="button"
              onClick={() =>
                setNotice(dict.auth.unsupportedSso)
              }
              className={socialButtonCls}
            >
              <SsoIcon />
              {dict.auth.continueWithSso}
            </button>
            {notice && (
              <p
                role="status"
                className="rounded-[6px] bg-[#f0f4ff] px-3 py-2 text-[13px] text-[#235fe2]"
              >
                {notice}
              </p>
            )}
          </div>

          <p className="mt-6 text-center text-[14px] text-[#6c6e79]">
            {data.altPrompt.text}{" "}
            <Link
              href={data.altPrompt.href}
              className="font-semibold text-[#181e15] underline underline-offset-2 hover:no-underline"
            >
              {data.altPrompt.linkLabel}
            </Link>
          </p>
          <p className="mt-4 text-center text-[12px] leading-[1.5] text-[#6c6e79]">
            By continuing you agree to the{" "}
            <span className="underline">Terms of Service</span> and{" "}
            <span className="underline">Privacy Policy</span>
          </p>
        </div>
      </main>
    </div>
  );
}
