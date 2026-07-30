"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface SiteAuditSetupValues {
  name: string;
  domain: string;
  crawlScope: "domain" | "subdomain";
  pageLimit: number;
  crawlSource: "website" | "sitemap";
  schedule: "off" | "daily" | "weekly";
}

const COPY = {
  ko: {
    title: "Site Audit 설정",
    tabCrawl: "도메인 · 크롤 설정",
    tabSchedule: "예약",
    projectName: "프로젝트 이름",
    projectNamePlaceholder: "예: 우리 사이트 진단",
    scopeLabel: "검사 범위",
    scopeHintDomain: "입력한 도메인과 모든 서브도메인(www., blog. 등)을 함께 크롤링합니다.",
    scopeHintSubdomain: "입력한 호스트만 크롤링합니다. 다른 서브도메인은 제외됩니다.",
    scopeDomain: "도메인",
    scopeSubdomain: "서브도메인",
    scopePath: "하위 폴더",
    preparing: "준비 중",
    domainLabel: "도메인 입력",
    domainPlaceholder: "example.com",
    domainError: "올바른 웹사이트를 입력하세요.",
    limitLabel: "검사 페이지 제한",
    limitHint: "한 번의 검사에서 확인할 페이지 수를 선택하세요. (최대 500)",
    limitCustom: "직접 입력",
    pages: "페이지",
    sourceLabel: "크롤링 소스",
    sourceWebsite: "웹사이트",
    sourceWebsiteHint: "사이트 내부 링크를 따라가며 페이지를 수집합니다.",
    sourceSitemap: "사이트맵",
    sourceSitemapHint: "sitemap.xml 에 등록된 URL 을 검사합니다.",
    sourceUrlList: "파일의 URL",
    scheduleLabel: "예약을 선택하세요",
    scheduleOff: "없음",
    scheduleOffHint: "수동으로만 크롤링을 실행합니다.",
    scheduleDaily: "매일",
    scheduleDailyHint: "매일 자동으로 크롤링합니다. (외부 cron이 /api/cron/run-due 를 호출할 때 실행)",
    scheduleWeekly: "매주",
    scheduleWeeklyHint: "매주 자동으로 크롤링합니다. (외부 cron이 /api/cron/run-due 를 호출할 때 실행)",
    cancel: "취소",
    start: "Start Site Audit",
    starting: "설정 저장 중…",
    nameRequired: "프로젝트 이름을 입력하세요.",
  },
  en: {
    title: "Setting up Site Audit",
    tabCrawl: "Domain · Crawl settings",
    tabSchedule: "Schedule",
    projectName: "Project name",
    projectNamePlaceholder: "e.g. My site audit",
    scopeLabel: "Crawl scope",
    scopeHintDomain: "Crawls the domain and all of its subdomains (www., blog., etc.).",
    scopeHintSubdomain: "Crawls only the exact host. Other subdomains are excluded.",
    scopeDomain: "Domain",
    scopeSubdomain: "Subdomain",
    scopePath: "Subfolder",
    preparing: "Coming soon",
    domainLabel: "Enter domain",
    domainPlaceholder: "example.com",
    domainError: "Enter a valid website.",
    limitLabel: "Limit of checked pages",
    limitHint: "Choose how many pages to check per audit. (max 500)",
    limitCustom: "Custom",
    pages: "pages",
    sourceLabel: "Crawl source",
    sourceWebsite: "Website",
    sourceWebsiteHint: "Discovers pages by following internal links.",
    sourceSitemap: "Sitemap",
    sourceSitemapHint: "Checks URLs listed in sitemap.xml.",
    sourceUrlList: "URLs from file",
    scheduleLabel: "Choose audit schedule",
    scheduleOff: "None",
    scheduleOffHint: "Runs only when started manually.",
    scheduleDaily: "Daily",
    scheduleDailyHint: "Crawls automatically every day. (runs when an external cron calls /api/cron/run-due)",
    scheduleWeekly: "Weekly",
    scheduleWeeklyHint: "Crawls automatically every week. (runs when an external cron calls /api/cron/run-due)",
    cancel: "Cancel",
    start: "Start Site Audit",
    starting: "Saving…",
    nameRequired: "Enter a project name.",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function Hint({ text }: { text: string }) {
  return (
    <span
      className="ml-1 inline-flex h-[16px] w-[16px] cursor-help items-center justify-center rounded-full border border-app-border text-[10px] text-app-text-secondary"
      title={text}
      aria-label={text}
    >
      ?
    </span>
  );
}

function RadioCard({
  checked,
  onChange,
  label,
  hint,
  disabled,
  disabledChip,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  disabledChip?: string;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 rounded-[8px] border px-3 py-2.5 transition-colors",
        disabled
          ? "cursor-not-allowed border-app-border bg-[#f9fafb] opacity-60"
          : "cursor-pointer",
        checked && !disabled ? "border-app-blue bg-[#f4f7fe]" : "border-app-border bg-white",
        !disabled && !checked && "hover:border-[#c4c7cf]"
      )}
    >
      <input
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 h-[16px] w-[16px] accent-[#235FE2]"
      />
      <span className="flex-1">
        <span className="flex items-center gap-2 text-[13px] font-medium text-app-text">
          {label}
          {disabled && disabledChip && (
            <span className="rounded-[4px] bg-[#eceef2] px-1.5 py-0.5 text-[10px] font-medium text-app-text-secondary">
              {disabledChip}
            </span>
          )}
        </span>
        {hint && <span className="mt-0.5 block text-[12px] text-app-text-secondary">{hint}</span>}
      </span>
    </label>
  );
}

export function SiteAuditSetupDialog({
  open,
  locale,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  locale: "ko" | "en";
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: SiteAuditSetupValues) => void;
}) {
  const copy: Copy = COPY[locale];
  const [tab, setTab] = useState<"crawl" | "schedule">("crawl");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [domain, setDomain] = useState("");
  const [scope, setScope] = useState<"domain" | "subdomain">("domain");
  const [limitChoice, setLimitChoice] = useState<"100" | "500" | "custom">("100");
  const [customLimit, setCustomLimit] = useState("50");
  const [source, setSource] = useState<"website" | "sitemap">("website");
  const [schedule, setSchedule] = useState<"off" | "daily" | "weekly">("off");
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const effectiveName = nameTouched ? name : domain.trim();
  const pageLimit =
    limitChoice === "custom"
      ? Math.max(1, Math.min(500, Number.parseInt(customLimit, 10) || 0))
      : Number(limitChoice);

  const submit = () => {
    if (!effectiveName.trim()) {
      setFieldError(copy.nameRequired);
      setTab("crawl");
      return;
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim())) {
      setFieldError(copy.domainError);
      setTab("crawl");
      return;
    }
    setFieldError(null);
    onSubmit({
      name: effectiveName.trim(),
      domain: domain.trim(),
      crawlScope: scope,
      pageLimit,
      crawlSource: source,
      schedule,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-[8px] bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
          <h2 className="text-[16px] font-semibold text-app-text">{copy.title}</h2>
          <button
            type="button"
            aria-label={copy.cancel}
            onClick={onClose}
            className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-app-text-secondary hover:bg-app-bg"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-5 border-b border-app-border px-5">
          {(
            [
              ["crawl", copy.tabCrawl],
              ["schedule", copy.tabSchedule],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px border-b-2 px-1 py-2.5 text-[13px] font-medium transition-colors",
                tab === key
                  ? "border-app-orange text-app-text"
                  : "border-transparent text-app-text-secondary hover:text-app-text"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-5 px-5 py-4">
          {tab === "crawl" ? (
            <>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-app-text">
                  {copy.projectName}
                </label>
                <input
                  value={nameTouched ? name : domain.trim()}
                  onChange={(event) => {
                    setNameTouched(true);
                    setName(event.target.value);
                  }}
                  placeholder={copy.projectNamePlaceholder}
                  className="h-[38px] w-full rounded-[8px] border border-app-border bg-white px-3 text-[13px] text-app-text outline-none focus:border-app-blue"
                />
              </div>

              <div>
                <span className="mb-1.5 flex items-center text-[13px] font-medium text-app-text">
                  {copy.scopeLabel}
                  <Hint
                    text={scope === "domain" ? copy.scopeHintDomain : copy.scopeHintSubdomain}
                  />
                </span>
                <div className="grid grid-cols-3 gap-1 rounded-[8px] border border-app-border bg-[#f3f4f6] p-1">
                  <button
                    type="button"
                    onClick={() => setScope("domain")}
                    className={cn(
                      "h-[30px] rounded-[6px] text-[12px] font-medium transition-colors",
                      scope === "domain"
                        ? "bg-white text-app-text shadow-sm"
                        : "text-app-text-secondary hover:text-app-text"
                    )}
                  >
                    {copy.scopeDomain}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("subdomain")}
                    className={cn(
                      "h-[30px] rounded-[6px] text-[12px] font-medium transition-colors",
                      scope === "subdomain"
                        ? "bg-white text-app-text shadow-sm"
                        : "text-app-text-secondary hover:text-app-text"
                    )}
                  >
                    {copy.scopeSubdomain}
                  </button>
                  <button
                    type="button"
                    disabled
                    title={copy.preparing}
                    className="flex h-[30px] cursor-not-allowed items-center justify-center gap-1.5 rounded-[6px] text-[12px] font-medium text-app-text-secondary opacity-60"
                  >
                    {copy.scopePath}
                    <span className="rounded-[4px] bg-[#e2e4e9] px-1 py-px text-[9px]">
                      {copy.preparing}
                    </span>
                  </button>
                </div>
                <p className="mt-1.5 text-[12px] text-app-text-secondary">
                  {scope === "domain" ? copy.scopeHintDomain : copy.scopeHintSubdomain}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-app-text">
                  {copy.domainLabel}
                </label>
                <input
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder={copy.domainPlaceholder}
                  className="h-[38px] w-full rounded-[8px] border border-app-border bg-white px-3 text-[13px] text-app-text outline-none focus:border-app-blue"
                />
              </div>

              <div>
                <span className="mb-1.5 flex items-center text-[13px] font-medium text-app-text">
                  {copy.limitLabel}
                  <Hint text={copy.limitHint} />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {(["100", "500"] as const).map((value) => (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px]",
                        limitChoice === value
                          ? "border-app-blue bg-[#f4f7fe] font-medium text-app-text"
                          : "border-app-border bg-white text-app-text-secondary"
                      )}
                    >
                      <input
                        type="radio"
                        className="h-[15px] w-[15px] accent-[#235FE2]"
                        checked={limitChoice === value}
                        onChange={() => setLimitChoice(value)}
                      />
                      {value} {copy.pages}
                    </label>
                  ))}
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px]",
                      limitChoice === "custom"
                        ? "border-app-blue bg-[#f4f7fe] font-medium text-app-text"
                        : "border-app-border bg-white text-app-text-secondary"
                    )}
                  >
                    <input
                      type="radio"
                      className="h-[15px] w-[15px] accent-[#235FE2]"
                      checked={limitChoice === "custom"}
                      onChange={() => setLimitChoice("custom")}
                    />
                    {copy.limitCustom}
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={customLimit}
                      onFocus={() => setLimitChoice("custom")}
                      onChange={(event) => setCustomLimit(event.target.value)}
                      className="h-[26px] w-[70px] rounded-[6px] border border-app-border px-2 text-[12px] text-app-text outline-none focus:border-app-blue"
                    />
                  </label>
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-app-text">
                  {copy.sourceLabel}
                </span>
                <div className="space-y-2">
                  <RadioCard
                    checked={source === "website"}
                    onChange={() => setSource("website")}
                    label={copy.sourceWebsite}
                    hint={copy.sourceWebsiteHint}
                  />
                  <RadioCard
                    checked={source === "sitemap"}
                    onChange={() => setSource("sitemap")}
                    label={copy.sourceSitemap}
                    hint={copy.sourceSitemapHint}
                  />
                  <RadioCard
                    checked={false}
                    onChange={() => undefined}
                    label={copy.sourceUrlList}
                    disabled
                    disabledChip={copy.preparing}
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <span className="mb-2 block text-[13px] font-medium text-app-text">
                {copy.scheduleLabel}
              </span>
              <div className="space-y-2">
                <RadioCard
                  checked={schedule === "off"}
                  onChange={() => setSchedule("off")}
                  label={copy.scheduleOff}
                  hint={copy.scheduleOffHint}
                />
                <RadioCard
                  checked={schedule === "daily"}
                  onChange={() => setSchedule("daily")}
                  label={copy.scheduleDaily}
                  hint={copy.scheduleDailyHint}
                />
                <RadioCard
                  checked={schedule === "weekly"}
                  onChange={() => setSchedule("weekly")}
                  label={copy.scheduleWeekly}
                  hint={copy.scheduleWeeklyHint}
                />
              </div>
            </div>
          )}

          {(fieldError || error) && (
            <p className="rounded-[8px] border border-[#f5c2cd] bg-[#fdecef] px-3 py-2 text-[13px] text-[#a4002a]">
              {fieldError ?? error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-app-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-[38px] rounded-[8px] border border-app-border bg-white px-4 text-[13px] font-medium text-app-text transition-colors hover:bg-app-bg"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="h-[38px] rounded-[8px] bg-app-orange px-5 text-[13px] font-medium text-white transition-colors hover:bg-[#e5541f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? copy.starting : copy.start}
          </button>
        </div>
      </div>
    </div>
  );
}
