"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, type FormEvent } from "react";
import { SEO_WIDGET_KEYS, type SeoProjectSettingsValue, type SeoWidgetKey } from "@/lib/seo-project-settings";
import { cn } from "@/lib/utils";

const WIDGET_LABELS: Record<SeoWidgetKey, { ko: string; en: string }> = {
  aiSearch: { ko: "AI 검색", en: "AI Search" },
  seoMetrics: { ko: "SEO 도메인 지표", en: "SEO domain metrics" },
  positionTracking: { ko: "포지션 추적", en: "Position Tracking" },
  siteAudit: { ko: "사이트 진단", en: "Site Audit" },
  onPageSeo: { ko: "온페이지 SEO 분석 도구", en: "On Page SEO Checker" },
  backlinkAudit: { ko: "백링크 진단", en: "Backlink Audit" },
  organicTrafficInsights: { ko: "자연 트래픽 인사이트", en: "Organic Traffic Insights" },
  trafficAnalytics: { ko: "트래픽 분석", en: "Traffic Analytics" },
  organicPositions: { ko: "자연 검색 포지션", en: "Organic Positions" },
  backlinks: { ko: "백링크", en: "Backlinks" },
  googleServices: { ko: "Google 서비스", en: "Google services" },
};

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: SeoProjectSettingsValue;
  ko: boolean;
  saving: boolean;
  error: string | null;
  onSave: (settings: SeoProjectSettingsValue) => Promise<void>;
}

export function SeoProjectSettingsDialog({
  open,
  onOpenChange,
  settings,
  ko,
  saving,
  error,
  onSave,
}: SettingsDialogProps) {
  const [draft, setDraft] = useState(settings);

  const setOpen = (next: boolean) => {
    setDraft(settings);
    onOpenChange(next);
  };

  const toggleWidget = (key: SeoWidgetKey, visible: boolean) => {
    setDraft((current) => ({
      ...current,
      hiddenWidgets: visible
        ? current.hiddenWidgets.filter((item) => item !== key)
        : [...current.hiddenWidgets, key],
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave(draft);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[700] bg-[#252a31]/65" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[710] max-h-[88dvh] w-[calc(100vw-32px)] max-w-[620px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[12px] bg-white p-6 shadow-[0_24px_80px_rgba(15,20,40,0.3)] focus:outline-none">
          <Dialog.Title className="text-[20px] font-semibold text-a2-text">
            {ko ? "SEO 프로젝트 설정" : "SEO project settings"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[13px] text-a2-text-muted">
            {ko
              ? "조회 데이터베이스와 대시보드에 표시할 위젯을 설정합니다."
              : "Configure the search database and visible dashboard widgets."}
          </Dialog.Description>

          <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[13px] font-medium text-a2-text">
                {ko ? "국가 코드" : "Country code"}
                <input
                  value={draft.countryCode}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      countryCode: event.target.value.toUpperCase().slice(0, 2),
                    }))
                  }
                  required
                  pattern="[A-Z]{2}"
                  maxLength={2}
                  className="mt-1 h-9 w-full rounded-[6px] border border-app-border px-3 uppercase outline-none focus:border-app-blue"
                />
              </label>
              <label className="text-[13px] font-medium text-a2-text">
                {ko ? "기기" : "Device"}
                <select
                  value={draft.device}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      device: event.target.value as SeoProjectSettingsValue["device"],
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-[6px] border border-app-border px-3 outline-none focus:border-app-blue"
                >
                  <option value="desktop">{ko ? "데스크톱" : "Desktop"}</option>
                  <option value="mobile">{ko ? "모바일" : "Mobile"}</option>
                </select>
              </label>
              <label className="text-[13px] font-medium text-a2-text">
                {ko ? "검색엔진" : "Search engine"}
                <select
                  value={draft.searchEngine}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      searchEngine: event.target.value as SeoProjectSettingsValue["searchEngine"],
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-[6px] border border-app-border px-3 outline-none focus:border-app-blue"
                >
                  <option value="google">Google</option>
                  <option value="bing">Bing</option>
                </select>
              </label>
              <label className="text-[13px] font-medium text-a2-text">
                {ko ? "조회 범위" : "Result scope"}
                <select
                  value={draft.resultScope}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      resultScope: event.target.value as SeoProjectSettingsValue["resultScope"],
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-[6px] border border-app-border px-3 outline-none focus:border-app-blue"
                >
                  <option value="domain">{ko ? "전체 도메인" : "Domain"}</option>
                  <option value="subdomain">{ko ? "서브도메인" : "Subdomain"}</option>
                  <option value="path">{ko ? "URL 경로" : "URL path"}</option>
                </select>
              </label>
            </div>

            <fieldset>
              <legend className="text-[14px] font-semibold text-a2-text">
                {ko ? "표시할 위젯" : "Visible widgets"}
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {SEO_WIDGET_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 rounded-[6px] border border-app-border px-3 py-2 text-[13px] text-a2-text">
                    <input
                      type="checkbox"
                      checked={!draft.hiddenWidgets.includes(key)}
                      onChange={(event) => toggleWidget(key, event.target.checked)}
                      className="h-4 w-4 accent-app-blue"
                    />
                    {WIDGET_LABELS[key][ko ? "ko" : "en"]}
                  </label>
                ))}
              </div>
            </fieldset>

            {error && <p role="alert" className="text-[13px] text-app-red">{error}</p>}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" disabled={saving} className="h-9 rounded-[6px] border border-app-border px-4 text-[13px] font-medium">
                  {ko ? "취소" : "Cancel"}
                </button>
              </Dialog.Close>
              <button type="submit" disabled={saving} className={cn("h-9 rounded-[6px] bg-[#1a1e1a] px-4 text-[13px] font-medium text-white", saving && "cursor-wait opacity-60")}>
                {saving ? (ko ? "저장 중…" : "Saving…") : ko ? "저장" : "Save"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SeoCreateProjectDialog({
  open,
  onOpenChange,
  ko,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ko: boolean;
  onCreated: (project: { id: string; name: string; domain: string }) => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/folders/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, domain }),
      });
      const body = (await response.json()) as {
        data?: { id: string; name: string; domain: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
      onCreated(body.data);
      setName("");
      setDomain("");
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ko ? "프로젝트를 만들지 못했습니다." : "Could not create project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[700] bg-[#252a31]/65" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[710] w-[calc(100vw-32px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-[12px] bg-white p-6 shadow-[0_24px_80px_rgba(15,20,40,0.3)] focus:outline-none">
          <Dialog.Title className="text-[20px] font-semibold text-a2-text">
            {ko ? "SEO 프로젝트 만들기" : "Create SEO project"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[13px] text-a2-text-muted">
            {ko ? "비즈니스명과 분석할 웹사이트를 입력하세요." : "Enter a business name and website to analyze."}
          </Dialog.Description>
          <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
            <label className="block text-[13px] font-medium text-a2-text">
              {ko ? "비즈니스명" : "Business name"}
              <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-10 w-full rounded-[6px] border border-app-border px-3 outline-none focus:border-app-blue" />
            </label>
            <label className="block text-[13px] font-medium text-a2-text">
              {ko ? "웹사이트" : "Website"}
              <input required value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" className="mt-1 h-10 w-full rounded-[6px] border border-app-border px-3 outline-none focus:border-app-blue" />
            </label>
            {error && <p role="alert" className="text-[13px] text-app-red">{error}</p>}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" disabled={saving} className="h-9 rounded-[6px] border border-app-border px-4 text-[13px] font-medium">{ko ? "취소" : "Cancel"}</button>
              </Dialog.Close>
              <button type="submit" disabled={saving} className="h-9 rounded-[6px] bg-[#1a1e1a] px-4 text-[13px] font-medium text-white disabled:cursor-wait disabled:opacity-60">
                {saving ? (ko ? "생성 중…" : "Creating…") : ko ? "만들기" : "Create"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
