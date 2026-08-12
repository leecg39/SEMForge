"use client";

// @TASK P1-F1-T1 - Authentication HTTP form boundaries
// @SPEC SEMForge paid beta plan#invite-only-auth
// @TEST src/components/core-shell/core-shell.test.ts
import Link from "next/link";
import { useState } from "react";

export type AuthVariant = "login" | "invite" | "forgot" | "reset";

type ApiError = { code?: string; message?: string; fields?: Record<string, string> };
type ApiEnvelope = { data?: unknown; error?: ApiError | null; requestId?: string };
type InviteLegalDocuments = {
  terms: { version: string; sha256: string };
  privacy: { version: string; sha256: string };
  presentedAt: string;
};

const endpoints: Record<AuthVariant, string> = {
  login: "/api/v1/auth/login",
  invite: "/api/v1/auth/invites/accept",
  forgot: "/api/v1/auth/password/forgot",
  reset: "/api/v1/auth/password/reset",
};

const submitLabels: Record<AuthVariant, string> = {
  login: "로그인",
  invite: "초대 수락하고 시작하기",
  forgot: "재설정 안내 받기",
  reset: "새 비밀번호 저장하기",
};

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function buildAuthPayload(formData: FormData, token?: string) {
  const payload: Record<string, string | boolean> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && key !== "passwordConfirmation") {
      payload[key] = key === "password" ? value : value.trim();
    }
  }
  if (formData.has("legalTermsVersion")) {
    payload.legalAccepted = formData.get("legalAccepted") === "on";
  }
  if (token) payload.token = token;
  return payload;
}

export function AuthForm({
  variant,
  token,
  legalDocuments,
}: {
  variant: AuthVariant;
  token?: string;
  legalDocuments?: InviteLegalDocuments;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const endpoint = endpoints[variant];
  const requiresPassword = variant !== "forgot";
  const requiresConfirmation = variant === "invite" || variant === "reset";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = getText(formData, "password");
    const passwordConfirmation = getText(formData, "passwordConfirmation");

    if (requiresConfirmation && password !== passwordConfirmation) {
      setIsError(true);
      setMessage("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    const payload = buildAuthPayload(formData, token);

    setPending(true);
    setMessage(null);
    setIsError(false);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope;
      if (!response.ok || envelope.error) {
        throw new Error(envelope.error?.message || "요청을 처리하지 못했습니다.");
      }

      if (variant === "forgot") {
        setMessage("계정이 존재하면 비밀번호 재설정 안내를 보내드립니다.");
      } else if (variant === "reset") {
        setMessage("비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.");
      } else {
        window.location.assign("/app");
      }
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="sf-auth-form"
      onSubmit={submit}
      data-endpoint={endpoint}
    >
      {(variant === "login" || variant === "forgot") && (
        <label className="sf-field">
          <span>이메일</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            aria-describedby={variant === "forgot" ? "forgot-hint" : undefined}
          />
          {variant === "forgot" && (
            <small id="forgot-hint">가입 여부와 관계없이 같은 안내가 표시됩니다.</small>
          )}
        </label>
      )}

      {variant === "invite" && (
        <label className="sf-field">
          <span>담당자 이름</span>
          <input name="displayName" type="text" autoComplete="name" required maxLength={80} />
        </label>
      )}

      {requiresPassword && (
        <label className="sf-field">
          <span>{variant === "reset" ? "새 비밀번호" : "비밀번호"}</span>
          <input
            name="password"
            type="password"
            autoComplete={variant === "login" ? "current-password" : "new-password"}
            required
            minLength={12}
            aria-describedby={variant === "login" ? undefined : "password-hint"}
          />
          {variant !== "login" && (
            <small id="password-hint">12자 이상으로 설정해 주세요.</small>
          )}
        </label>
      )}

      {requiresConfirmation && (
        <label className="sf-field">
          <span>비밀번호 확인</span>
          <input
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
          />
        </label>
      )}

      {variant === "invite" && legalDocuments && (
        <fieldset className="sf-field">
          <legend>약관 및 개인정보 처리방침 동의</legend>
          <input type="hidden" name="legalTermsVersion" value={legalDocuments.terms.version} />
          <input type="hidden" name="legalTermsSha256" value={legalDocuments.terms.sha256} />
          <input type="hidden" name="legalPrivacyVersion" value={legalDocuments.privacy.version} />
          <input type="hidden" name="legalPrivacySha256" value={legalDocuments.privacy.sha256} />
          <input type="hidden" name="legalPresentedAt" value={legalDocuments.presentedAt} />
          <label className="sf-checkbox">
            <input name="legalAccepted" type="checkbox" required />
            <span>
              <Link href="/legal/terms" target="_blank">이용약관</Link> 및{" "}
              <Link href="/legal/privacy" target="_blank">개인정보 처리방침</Link>에 동의합니다.
            </span>
          </label>
        </fieldset>
      )}

      {message && (
        <p className={isError ? "sf-form-message sf-form-message--error" : "sf-form-message"} role={isError ? "alert" : "status"}>
          {message}
        </p>
      )}

      <button className="sf-button sf-button--primary sf-button--full" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "처리 중…" : submitLabels[variant]}
      </button>

      {variant === "login" && (
        <div className="sf-auth-form__links">
          <Link href="/forgot-password">비밀번호를 잊으셨나요?</Link>
        </div>
      )}
      {(variant === "forgot" || variant === "reset") && (
        <div className="sf-auth-form__links">
          <Link href="/login">로그인으로 돌아가기</Link>
        </div>
      )}
    </form>
  );
}
