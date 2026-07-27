"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientApiError, api } from "@/lib/client-api";

/** 원본과 동일하게 명시적 저장 버튼(변경사항 저장하기 / 취소)을 사용한다. */
export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const dirty = name !== initialName;

  async function save() {
    setSaving(true);
    setFieldError(null);
    setStatus("");
    try {
      await api.patch("/api/account/profile/", { name });
      setStatus("변경사항을 저장했습니다.");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ClientApiError) {
        setFieldError(caught.fields?.name ?? caught.message);
      } else {
        setFieldError("저장하지 못했습니다.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-[420px] flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-name" className="text-[13px] font-medium">
          성명
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          placeholder="성명"
          aria-invalid={Boolean(fieldError)}
          onChange={(e) => setName(e.target.value)}
          className="h-[38px] rounded-[6px] border border-app-border px-3 text-[14px] outline-none focus:border-app-link"
        />
        {fieldError && <p className="text-[12px] text-app-red">{fieldError}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-app-text-secondary">시간대</label>
        <p className="rounded-[6px] bg-app-bg px-3 py-2 text-[13px] text-app-text-secondary">
          Asia/Seoul (고정)
        </p>
      </div>

      <p aria-live="polite" role="status" className="text-[13px] text-[#0a6b57]">
        {status}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="h-[36px] rounded-[6px] bg-[#1b1f23] px-3 text-[13px] font-medium text-white disabled:opacity-40"
        >
          {saving ? "저장 중…" : "변경사항 저장하기"}
        </button>
        <button
          type="button"
          onClick={() => {
            setName(initialName);
            setFieldError(null);
            setStatus("");
          }}
          disabled={!dirty}
          className="h-[36px] rounded-[6px] border border-app-border px-3 text-[13px] font-medium disabled:opacity-40"
        >
          취소
        </button>
      </div>
    </div>
  );
}
