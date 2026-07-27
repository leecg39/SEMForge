"use client";

import { useEffect, useState } from "react";
import { ClientApiError, api } from "@/lib/client-api";

interface Setting {
  key: string;
  label: string;
  enabled: boolean;
}

/** 원본 알림 설정: 그룹 "일반" 아코디언 + "n/3 활성" 카운터 + 즉시 저장 (증거 O) */
export function NotificationToggles({ email }: { email: string }) {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await api.get<Setting[]>("/api/notifications/");
        setSettings(response.data);
        setSummary((response.meta as { summary?: string })?.summary ?? "");
      } catch (caught) {
        setError(
          caught instanceof ClientApiError ? caught.message : "설정을 불러오지 못했습니다."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggle(key: string, enabled: boolean) {
    // 낙관적 갱신 후 실패 시 되돌린다.
    const previous = settings;
    const next = settings.map((s) => (s.key === key ? { ...s, enabled } : s));
    setSettings(next);
    setSummary(`${next.filter((s) => s.enabled).length}/${next.length} 활성`);
    setError(null);
    try {
      await api.patch("/api/notifications/", { key, enabled });
      setStatus("알림 설정을 저장했습니다.");
    } catch (caught) {
      setSettings(previous);
      setError(
        caught instanceof ClientApiError ? caught.message : "설정을 저장하지 못했습니다."
      );
    }
  }

  return (
    <div className="rounded-[8px] border border-app-border bg-white">
      <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
        <div>
          <p className="text-[14px] font-semibold">일반</p>
          <p className="text-[12px] text-app-text-secondary">{email}</p>
        </div>
        <span className="rounded-[4px] bg-app-bg px-2 py-1 text-[12px] text-app-text-secondary">
          {summary}
        </span>
      </div>

      <p aria-live="polite" role="status" className="sr-only">
        {status}
      </p>

      {loading ? (
        <p className="px-5 py-4 text-[13px] text-app-text-secondary">데이터 로드 중</p>
      ) : (
        <ul>
          {settings.map((setting) => (
            <li
              key={setting.key}
              className="flex items-center justify-between border-b border-[#eef0f2] px-5 py-3 last:border-b-0"
            >
              <label
                htmlFor={`notif-${setting.key}`}
                className="text-[13px]"
              >
                {setting.label}
              </label>
              <input
                id={`notif-${setting.key}`}
                type="checkbox"
                checked={setting.enabled}
                onChange={(e) => toggle(setting.key, e.target.checked)}
                className="h-[16px] w-[16px]"
              />
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="border-t border-app-border px-5 py-3 text-[13px] text-app-red">
          {error}
        </p>
      )}
    </div>
  );
}
