"use client";

// @TASK P1-F1-T1 - Workspace brand settings form boundary
// @SPEC SEMForge paid beta plan#fixed-report-branding
// @TEST src/components/core-shell/core-shell.test.ts
import { useState } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

export function WorkspaceSettingsForm() {
  const [state, setState] = useState<SaveState>("idle");
  const endpoint = "/api/v1/settings/workspace";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      [...formData.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    setState("saving");

    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("save failed");
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <form className="sf-settings-form" onSubmit={submit} data-endpoint={endpoint}>
      <div className="sf-form-grid">
        <label className="sf-field">
          <span>대행사 이름</span>
          <input name="agencyName" type="text" autoComplete="organization" required maxLength={80} />
        </label>
        <label className="sf-field">
          <span>강조색</span>
          <span className="sf-color-field">
            <input name="accentColor" type="color" defaultValue="#0f6b63" aria-label="리포트 강조색" />
            <small>PDF와 이메일 리포트에 적용됩니다.</small>
          </span>
        </label>
      </div>
      <label className="sf-field">
        <span>로고 URL</span>
        <input name="logoUrl" type="url" inputMode="url" placeholder="https://example.com/logo.svg" />
        <small>HTTPS 이미지 주소만 사용하세요. 업로드 기능은 베타 이후 제공됩니다.</small>
      </label>
      <div className="sf-form-actions">
        <button className="sf-button sf-button--primary" type="submit" disabled={state === "saving"} aria-busy={state === "saving"}>
          {state === "saving" ? "저장 중…" : "브랜드 설정 저장"}
        </button>
        {state === "saved" && <p role="status">설정을 저장했습니다.</p>}
        {state === "error" && <p role="alert">설정을 저장하지 못했습니다. 다시 시도해 주세요.</p>}
      </div>
    </form>
  );
}
