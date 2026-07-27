"use client";

import { useEffect, useState } from "react";

/** CMP-024 쿠키 동의 설정 모달. 푸터의 'open-cookie-settings' 이벤트로 열림. */
const categories = [
  { name: "Strictly necessary", body: "Required for the site to function. Always on.", locked: true },
  { name: "Performance", body: "Help us understand how the site is used.", locked: false },
  { name: "Functional", body: "Remember your preferences and choices.", locked: false },
  { name: "Targeting", body: "Used to personalize content and ads.", locked: false },
];

export default function CookieConsentModal() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean[]>([true, true, true, false]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-cookie-settings", handler);
    return () => window.removeEventListener("open-cookie-settings", handler);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-[560px] rounded-2xl bg-white p-8 shadow-2xl">
        <h2 className="font-[family-name:var(--font-lazzer)] text-[22px] font-semibold text-[#181e15]">
          Cookie settings
        </h2>
        <p className="mt-2 text-[14px] text-[#6c6e79]">
          Manage how this site uses cookies. This is a representative consent dialog.
        </p>
        <div className="mt-6 space-y-4">
          {categories.map((c, i) => (
            <div key={c.name} className="flex items-start justify-between gap-4 border-b border-[#f0f1f2] pb-4">
              <div>
                <div className="text-[15px] font-semibold text-[#181e15]">{c.name}</div>
                <div className="text-[13px] text-[#6c6e79]">{c.body}</div>
              </div>
              <button
                type="button"
                disabled={c.locked}
                onClick={() => setEnabled((e) => e.map((v, j) => (j === i ? !v : v)))}
                className={`mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${
                  enabled[i] ? "bg-[#c190ff]" : "bg-[#d1d2d5]"
                } ${c.locked ? "opacity-50" : ""}`}
                aria-label={`Toggle ${c.name}`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                    enabled[i] ? "translate-x-[22px]" : "translate-x-[2px]"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full border border-[#181e15] px-5 py-2.5 text-[14px] font-semibold text-[#181e15]"
          >
            Reject all
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full bg-[#181e15] px-5 py-2.5 text-[14px] font-semibold text-white"
          >
            Save preferences
          </button>
        </div>
      </div>
    </div>
  );
}
