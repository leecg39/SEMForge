"use client";

// @TASK P1-F1-T1 - Workspace brand settings form boundary
// @SPEC SEMForge paid beta plan#fixed-report-branding
// @TEST src/components/core-shell/core-shell.test.ts
import { useEffect, useState } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";
type LoadState = "loading" | "ready" | "error";

interface BrandingDraft {
  readonly name: string;
  readonly logoUrl: string;
  readonly accentColor: string;
}

function isBranding(value: unknown): value is {
  readonly name: string;
  readonly logoUrl: string | null;
  readonly accentColor: string;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" &&
    (typeof record.logoUrl === "string" || record.logoUrl === null) &&
    typeof record.accentColor === "string"
  );
}

export function WorkspaceSettingsForm() {
  const [state, setState] = useState<SaveState>("idle");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [draft, setDraft] = useState<BrandingDraft>({
    name: "",
    logoUrl: "",
    accentColor: "#0F6B63",
  });
  const endpoint = "/api/v1/reports/branding";

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        const data =
          typeof payload === "object" && payload !== null && "data" in payload
            ? (payload as { readonly data?: unknown }).data
            : undefined;
        if (!response.ok || !isBranding(data)) throw new Error("invalid branding response");
        setDraft({
          name: data.name,
          logoUrl: data.logoUrl ?? "",
          accentColor: data.accentColor,
        });
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");

    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          logoUrl: draft.logoUrl.trim() || null,
          accentColor: draft.accentColor,
        }),
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
          <input
            name="name"
            type="text"
            autoComplete="organization"
            required
            maxLength={80}
            value={draft.name}
            onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
          />
        </label>
        <label className="sf-field">
          <span>강조색</span>
          <span className="sf-color-field">
            <input
              name="accentColor"
              type="color"
              value={draft.accentColor}
              aria-label="리포트 강조색"
              onChange={(event) =>
                setDraft((value) => ({ ...value, accentColor: event.target.value }))
              }
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
          value={draft.logoUrl}
          onChange={(event) => setDraft((value) => ({ ...value, logoUrl: event.target.value }))}
        />
        <small>HTTPS 이미지 주소만 사용하세요. 업로드 기능은 베타 이후 제공됩니다.</small>
      </label>
      <div className="sf-form-actions">
        <button className="sf-button sf-button--primary" type="submit" disabled={state === "saving" || loadState === "loading"} aria-busy={state === "saving" || loadState === "loading"}>
          {state === "saving" ? "저장 중…" : "브랜드 설정 저장"}
        </button>
        {loadState === "error" && <p role="alert">기존 브랜드 설정을 불러오지 못했습니다.</p>}
        {state === "saved" && <p role="status">설정을 저장했습니다.</p>}
        {state === "error" && <p role="alert">설정을 저장하지 못했습니다. 다시 시도해 주세요.</p>}
      </div>
    </form>
  );
}
