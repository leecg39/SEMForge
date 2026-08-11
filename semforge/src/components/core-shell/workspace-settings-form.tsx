"use client";

// @TASK P4-F1-T1 - Report branding settings API boundary
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/core-shell/core-shell.test.ts
import { useState } from "react";

import { mutateApi } from "@/components/product/api-client";
import { parseBrandingContract, type BrandingView } from "@/components/product/contracts";

type SaveState = "idle" | "saving" | "saved" | "error";

export function WorkspaceSettingsForm({
  initialValue,
  canWrite = true,
  onSaved,
}: {
  initialValue?: BrandingView;
  canWrite?: boolean;
  onSaved?: () => void;
} = {}) {
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState(
    "설정을 저장하지 못했습니다. 다시 시도해 주세요.",
  );
  const endpoint = "/api/v1/reports/branding" as const;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name");
    const accentColor = formData.get("accentColor");
    const logoUrl = formData.get("logoUrl");
    if (typeof name !== "string" || typeof accentColor !== "string" || typeof logoUrl !== "string") {
      return;
    }
    setState("saving");

    try {
      await mutateApi(
        endpoint,
        "PATCH",
        {
          name: name.trim(),
          accentColor,
          logoUrl: logoUrl.trim() || null,
        },
        parseBrandingContract,
      );
      setState("saved");
      onSaved?.();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "설정을 저장하지 못했습니다. 다시 시도해 주세요.",
      );
      setState("error");
    }
  }

  const disabled = !canWrite || state === "saving";
  return (
    <form className="sf-settings-form" onSubmit={submit} data-endpoint={endpoint}>
      <div className="sf-form-grid">
        <label className="sf-field">
          <span>대행사 이름</span>
          <input
            name="name"
            type="text"
            autoComplete="organization"
            required
            maxLength={80}
            defaultValue={initialValue?.name}
            disabled={disabled}
          />
        </label>
        <label className="sf-field">
          <span>강조색</span>
          <span className="sf-color-field">
            <input
              name="accentColor"
              type="color"
              defaultValue={initialValue?.accentColor ?? "#0f675f"}
              aria-label="리포트 강조색"
              disabled={disabled}
            />
            <small>PDF와 이메일 리포트에 적용됩니다.</small>
          </span>
        </label>
      </div>
      <label className="sf-field">
        <span>로고 URL</span>
        <input
          name="logoUrl"
          type="url"
          inputMode="url"
          maxLength={2048}
          placeholder="https://example.com/logo.svg"
          defaultValue={initialValue?.logoUrl ?? ""}
          disabled={disabled}
        />
        <small>HTTPS 이미지 주소만 사용하세요. 업로드 기능은 베타 이후 제공됩니다.</small>
      </label>
      <div className="sf-form-actions">
        <button
          className="sf-button sf-button--primary"
          type="submit"
          disabled={disabled}
          aria-busy={state === "saving"}
        >
          {state === "saving" ? "저장 중…" : "브랜드 설정 저장"}
        </button>
        {state === "saved" && <p role="status">설정을 저장했습니다.</p>}
        {state === "error" && <p role="alert">{errorMessage}</p>}
        {!canWrite && <p role="status">현재 구독 상태에서는 읽기 전용입니다.</p>}
      </div>
    </form>
  );
}
