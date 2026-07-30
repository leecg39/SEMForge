"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";

type CollectSchedule = "off" | "daily" | "weekly";

interface CampaignScheduleState {
  campaignId: string;
  schedule: CollectSchedule;
  nextRunAt: number | null;
  migrated: boolean;
}

const COPY = {
  ko: {
    label: "자동 수집",
    off: "사용 안 함",
    daily: "매일",
    weekly: "매주",
    nextRun: "다음 실행",
    saveError: "스케줄을 저장하지 못했습니다.",
    migrationNeeded: "주기 수집은 DB 마이그레이션(0008) 적용 후 사용할 수 있습니다.",
    updating: "저장 중…",
  },
  en: {
    label: "Auto collection",
    off: "Off",
    daily: "Daily",
    weekly: "Weekly",
    nextRun: "Next run",
    saveError: "Schedule could not be saved.",
    migrationNeeded: "Scheduled collection is available after applying DB migration 0008.",
    updating: "Saving…",
  },
} as const;

export function ScheduleControl({
  campaignId,
  canEdit,
}: {
  campaignId: string;
  canEdit: boolean;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [result, setResult] = useState<{ id: string; state: CampaignScheduleState } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loading = result?.id !== campaignId;
  const state = !loading && result ? result.state : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.get<CampaignScheduleState>(
          `/api/position-tracking/${encodeURIComponent(campaignId)}/schedule/`
        );
        if (!cancelled) setResult({ id: campaignId, state: response.data });
      } catch {
        if (!cancelled) {
          setResult({
            id: campaignId,
            state: { campaignId, schedule: "off", nextRunAt: null, migrated: false },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const update = async (schedule: CollectSchedule) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await api.post<CampaignScheduleState>(
        `/api/position-tracking/${encodeURIComponent(campaignId)}/schedule/`,
        { schedule }
      );
      setResult({ id: campaignId, state: response.data });
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : COPY.ko.saveError);
    } finally {
      setSaving(false);
    }
  };

  const dateFormatter = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (loading || !state) {
    return <span className="text-[12px] text-app-text-secondary">…</span>;
  }

  if (!state.migrated) {
    return (
      <span className="max-w-[260px] text-[12px] leading-[18px] text-app-text-secondary">
        {copy.migrationNeeded}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-[12px] text-app-text-secondary">
        {copy.label}
        <select
          value={state.schedule}
          disabled={!canEdit || saving}
          onChange={(event) => void update(event.target.value as CollectSchedule)}
          className="h-[32px] rounded-[6px] border border-app-border bg-white px-2 text-[13px] text-app-text disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="off">{copy.off}</option>
          <option value="daily">{copy.daily}</option>
          <option value="weekly">{copy.weekly}</option>
        </select>
      </label>
      {state.schedule !== "off" && state.nextRunAt !== null && (
        <span className="text-[12px] text-app-text-secondary">
          {copy.nextRun} {dateFormatter.format(new Date(state.nextRunAt))}
        </span>
      )}
      {saving && <span className="text-[12px] text-app-text-secondary">{copy.updating}</span>}
      {error && (
        <span className="text-[12px] text-app-red" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
