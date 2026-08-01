"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export interface SiteAuditEditableConfig {
  id: string;
  version: number;
  crawlScope: "domain" | "subdomain" | "path";
  pageLimit: number;
  crawlSource: "website" | "sitemap" | "url_list";
  schedule: "off" | "daily" | "weekly" | "monthly";
  notifyOnComplete: boolean;
  emailOnComplete: boolean;
  crawlerUserAgent: "semforge" | "googlebot" | "bingbot";
  allowPaths: string[];
  disallowPaths: string[];
  ignoreQueryParameters: string[];
}

interface ProjectIdentity {
  id: string;
  name: string;
  domain: string;
}

const STEPS = [
  [1, "기본 설정", "범위·제한·소스"],
  [2, "크롤러", "User-Agent"],
  [3, "URL 규칙", "허용·제외 경로"],
  [4, "매개변수", "중복 URL 정규화"],
  [5, "예약·알림", "자동 실행·완료 알림"],
] as const;

function lines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description: string;
}) {
  return (
    <label className={cn("flex items-start gap-3 rounded-[8px] border border-app-border p-3", disabled ? "cursor-not-allowed bg-[#f6f7f9] opacity-65" : "cursor-pointer bg-white")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[#235FE2]"
      />
      <span>
        <span className="block text-[13px] font-medium text-app-text">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-5 text-app-text-secondary">{description}</span>
      </span>
    </label>
  );
}

export function SiteAuditProjectSetupDialog({
  open,
  onOpenChange,
  project,
  config,
  emailConfigured,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectIdentity | null;
  config: SiteAuditEditableConfig | null;
  emailConfigured: boolean;
  onSaved: (campaignId: string, started: boolean) => void;
}) {
  const [step, setStep] = useState(1);
  const [scope, setScope] = useState<"domain" | "subdomain" | "path">(config?.crawlScope ?? "domain");
  const [pageLimit, setPageLimit] = useState(String(config?.pageLimit ?? 100));
  const [source, setSource] = useState<"website" | "sitemap">(config?.crawlSource === "sitemap" ? "sitemap" : "website");
  const [userAgent, setUserAgent] = useState<"semforge" | "googlebot" | "bingbot">(config?.crawlerUserAgent ?? "semforge");
  const [allowPaths, setAllowPaths] = useState((config?.allowPaths ?? []).join("\n"));
  const [disallowPaths, setDisallowPaths] = useState((config?.disallowPaths ?? []).join("\n"));
  const [queryParameters, setQueryParameters] = useState((config?.ignoreQueryParameters ?? ["utm_source", "utm_medium", "utm_campaign"]).join("\n"));
  const [schedule, setSchedule] = useState<"off" | "daily" | "weekly">(config?.schedule === "daily" || config?.schedule === "weekly" ? config.schedule : "off");
  const [notifyInApp, setNotifyInApp] = useState(config?.notifyOnComplete ?? true);
  const [notifyEmail, setNotifyEmail] = useState(emailConfigured ? (config?.emailOnComplete ?? false) : false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedLimit = Number.parseInt(pageLimit, 10);
  const validation = useMemo(() => {
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      return "페이지 제한은 1~500 사이의 정수여야 합니다.";
    }
    const pathValues = [...lines(allowPaths), ...lines(disallowPaths)];
    if (pathValues.some((path) => !path.startsWith("/"))) {
      return "URL 경로 규칙은 / 로 시작해야 합니다.";
    }
    if (lines(queryParameters).some((value) => !/^[A-Za-z0-9_.~-]+$/.test(value))) {
      return "쿼리 매개변수는 이름만 입력하세요. 예: utm_source";
    }
    return null;
  }, [allowPaths, disallowPaths, parsedLimit, queryParameters]);

  if (!project) return null;

  const save = async (startAfterSave: boolean) => {
    if (submitting || validation) {
      if (validation) setError(validation);
      return;
    }
    setSubmitting(true);
    setError(null);
    const values = {
      crawlScope: scope,
      pageLimit: parsedLimit,
      crawlSource: source,
      crawlerUserAgent: userAgent,
      allowPaths: lines(allowPaths),
      disallowPaths: lines(disallowPaths),
      ignoreQueryParameters: lines(queryParameters),
      notifyOnComplete: notifyInApp,
      emailOnComplete: emailConfigured && notifyEmail,
    };
    try {
      let campaignId: string;
      if (config) {
        const saved = await api.patch<{ id: string }>(`/api/site-audits/${encodeURIComponent(config.id)}/`, {
          ...values,
          version: config.version,
        });
        campaignId = saved.data.id;
      } else {
        const saved = await api.post<{ id: string }>("/api/site-audits/", {
          ...values,
          folderId: project.id,
          name: project.name,
          domain: project.domain,
          schedule: "off",
        });
        campaignId = saved.data.id;
      }

      await api.post(`/api/site-audits/${encodeURIComponent(campaignId)}/schedule/`, { schedule });
      if (startAfterSave) {
        await api.post(`/api/site-audits/${encodeURIComponent(campaignId)}/run/`);
      }
      onSaved(campaignId, startAfterSave);
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof ClientApiError
          ? (caught.fields?.allowPaths ?? caught.fields?.ignoreQueryParameters ?? caught.message)
          : "사이트 진단 설정을 저장하지 못했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[700] bg-[#252a31]/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[710] flex h-[min(720px,calc(100vh-32px))] w-[min(980px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[10px] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.35)] focus:outline-none">
          <Dialog.Title className="sr-only">{project.name} 사이트 진단 설정</Dialog.Title>
          <Dialog.Description className="sr-only">크롤 범위, 사용자 에이전트, URL 규칙, 예약과 알림을 단계별로 설정합니다.</Dialog.Description>

          <aside className="hidden w-[248px] shrink-0 bg-[#252a31] px-5 py-7 text-white sm:block" aria-label="설정 단계">
            <p className="px-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/55">Site Audit</p>
            <ol className="mt-5 space-y-1">
              {STEPS.map(([number, label, hint]) => (
                <li key={number}>
                  <button
                    type="button"
                    onClick={() => setStep(number)}
                    aria-current={step === number ? "step" : undefined}
                    className={cn("flex w-full items-start gap-3 rounded-[8px] px-3 py-3 text-left", step === number ? "bg-white/12" : "hover:bg-white/7")}
                  >
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", step === number ? "border-[#ff6b35] bg-[#ff6b35] text-white" : "border-white/35 text-white/70")}>{number}</span>
                    <span>
                      <span className="block text-[13px] font-semibold">{label}</span>
                      <span className="mt-0.5 block text-[11px] text-white/55">{hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-start justify-between border-b border-app-border px-6 py-5 sm:px-8">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-app-orange">단계 {step}/5</p>
                <h2 className="mt-1 truncate text-[20px] font-semibold text-app-text">{STEPS[step - 1][1]}</h2>
                <p className="mt-1 truncate text-[12px] text-app-text-secondary">{project.name} · {project.domain}</p>
              </div>
              <Dialog.Close asChild>
                <button type="button" disabled={submitting} aria-label="설정 닫기" className="flex h-9 w-9 items-center justify-center rounded-[7px] text-app-text-secondary hover:bg-app-bg disabled:opacity-50">✕</button>
              </Dialog.Close>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6 sm:px-8">
              <div className="mx-auto w-full max-w-[620px] flex-1">
                {step === 1 && (
                  <section className="space-y-6">
                    <div>
                      <span className="mb-2 block text-[13px] font-semibold text-app-text">크롤 범위</span>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {([ ["domain", "전체 도메인"], ["subdomain", "현재 호스트"], ["path", "허용 경로만"] ] as const).map(([value, label]) => (
                          <label key={value} className={cn("cursor-pointer rounded-[8px] border p-3 text-[13px]", scope === value ? "border-app-blue bg-[#f4f7fe] font-medium" : "border-app-border")}> 
                            <input type="radio" className="mr-2 accent-[#235FE2]" checked={scope === value} onChange={() => setScope(value)} />{label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="block">
                      <span className="mb-2 block text-[13px] font-semibold text-app-text">페이지 제한</span>
                      <input type="number" min={1} max={500} value={pageLimit} onChange={(event) => setPageLimit(event.target.value)} className="h-10 w-full rounded-[7px] border border-app-border px-3 text-[14px] outline-none focus:border-app-blue" />
                      <span className="mt-1.5 block text-[12px] text-app-text-secondary">실행 진행률의 분모와 최대 수집 페이지 수에 실제로 적용됩니다.</span>
                    </label>
                    <div>
                      <span className="mb-2 block text-[13px] font-semibold text-app-text">크롤 시작 소스</span>
                      <div className="space-y-2">
                        {([ ["website", "웹사이트", "내부 링크를 따라 페이지를 발견합니다."], ["sitemap", "sitemap.xml", "사이트맵 URL에서 수집을 시작합니다."] ] as const).map(([value, label, hint]) => (
                          <label key={value} className={cn("flex cursor-pointer gap-3 rounded-[8px] border p-3", source === value ? "border-app-blue bg-[#f4f7fe]" : "border-app-border")}>
                            <input type="radio" checked={source === value} onChange={() => setSource(value)} className="mt-0.5 accent-[#235FE2]" />
                            <span><span className="block text-[13px] font-medium">{label}</span><span className="mt-0.5 block text-[12px] text-app-text-secondary">{hint}</span></span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {step === 2 && (
                  <section>
                    <p className="text-[13px] leading-5 text-app-text-secondary">robots.txt와 서버 로그에서 크롤러를 구분할 User-Agent 프리셋입니다.</p>
                    <div className="mt-4 space-y-2">
                      {([ ["semforge", "SemforgeBot", "기본 진단 크롤러"], ["googlebot", "Googlebot", "검색 엔진 크롤러 관점"], ["bingbot", "bingbot", "Bing 크롤러 관점"] ] as const).map(([value, label, hint]) => (
                        <label key={value} className={cn("flex cursor-pointer gap-3 rounded-[8px] border p-4", userAgent === value ? "border-app-blue bg-[#f4f7fe]" : "border-app-border")}>
                          <input type="radio" checked={userAgent === value} onChange={() => setUserAgent(value)} className="mt-0.5 accent-[#235FE2]" />
                          <span><span className="block text-[13px] font-semibold">{label}</span><span className="mt-1 block text-[12px] text-app-text-secondary">{hint}</span></span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-4 rounded-[8px] bg-[#f5f6f8] p-3 text-[12px] leading-5 text-app-text-secondary">선택 값은 자체 크롤러 요청에 적용됩니다. Firecrawl API가 사용되는 실행에서는 공급자가 임의 User-Agent 전달을 지원하지 않아 URL 규칙만 동일하게 적용됩니다.</p>
                  </section>
                )}

                {step === 3 && (
                  <section className="grid gap-5 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-[13px] font-semibold text-app-text">허용 경로</span>
                      <textarea value={allowPaths} onChange={(event) => setAllowPaths(event.target.value)} rows={10} placeholder={"/blog\n/docs"} className="w-full resize-y rounded-[7px] border border-app-border p-3 font-mono text-[13px] outline-none focus:border-app-blue" />
                      <span className="mt-1 block text-[11px] text-app-text-secondary">비워 두면 모든 경로 허용 · 한 줄에 하나</span>
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[13px] font-semibold text-app-text">제외 경로</span>
                      <textarea value={disallowPaths} onChange={(event) => setDisallowPaths(event.target.value)} rows={10} placeholder={"/admin\n/cart"} className="w-full resize-y rounded-[7px] border border-app-border p-3 font-mono text-[13px] outline-none focus:border-app-blue" />
                      <span className="mt-1 block text-[11px] text-app-text-secondary">발견·사이트맵 URL 모두에서 제외됩니다.</span>
                    </label>
                  </section>
                )}

                {step === 4 && (
                  <section>
                    <label className="block">
                      <span className="mb-2 block text-[13px] font-semibold text-app-text">무시할 쿼리 매개변수</span>
                      <textarea value={queryParameters} onChange={(event) => setQueryParameters(event.target.value)} rows={12} placeholder={"utm_source\nfbclid"} className="w-full resize-y rounded-[7px] border border-app-border p-3 font-mono text-[13px] outline-none focus:border-app-blue" />
                    </label>
                    <p className="mt-3 text-[12px] leading-5 text-app-text-secondary">URL 저장과 방문 중 이 매개변수를 제거해 추적 파라미터가 다른 동일 페이지를 중복 크롤하지 않습니다. 한 줄에 이름만 입력하세요.</p>
                  </section>
                )}

                {step === 5 && (
                  <section className="space-y-6">
                    <div>
                      <span className="mb-2 block text-[13px] font-semibold text-app-text">자동 실행</span>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {([ ["off", "수동"], ["daily", "매일"], ["weekly", "매주"] ] as const).map(([value, label]) => (
                          <label key={value} className={cn("cursor-pointer rounded-[8px] border p-3 text-[13px]", schedule === value ? "border-app-blue bg-[#f4f7fe] font-medium" : "border-app-border")}><input type="radio" checked={schedule === value} onChange={() => setSchedule(value)} className="mr-2 accent-[#235FE2]" />{label}</label>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-app-text-secondary">예약 시각은 DB에 저장되며 due runner가 재시작 후에도 회수합니다.</p>
                    </div>
                    <div className="space-y-2">
                      <Toggle checked={notifyInApp} onChange={setNotifyInApp} label="인앱 완료 알림" description="완료·실패 결과를 상단 알림함에 저장합니다." />
                      <Toggle checked={notifyEmail} onChange={setNotifyEmail} disabled={!emailConfigured} label="이메일 완료 알림" description={emailConfigured ? "계정 이메일로 완료·실패 결과를 보냅니다." : "RESEND_API_KEY와 RESEND_FROM_EMAIL을 설정하면 사용할 수 있습니다."} />
                    </div>
                  </section>
                )}

                {(error || (step === 5 && validation)) && (
                  <p role="alert" className="mt-5 rounded-[8px] border border-[#f5c2cd] bg-[#fdecef] px-3 py-2.5 text-[13px] text-[#a4002a]">{error ?? validation}</p>
                )}
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border px-6 py-4 sm:px-8">
              <button type="button" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1 || submitting} className="h-10 rounded-[7px] border border-app-border px-4 text-[13px] font-medium text-app-text hover:bg-app-bg disabled:opacity-40">이전</button>
              <div className="ml-auto flex items-center gap-2">
                {step < 5 ? (
                  <button type="button" onClick={() => setStep((value) => Math.min(5, value + 1))} className="h-10 rounded-[7px] bg-app-blue px-5 text-[13px] font-semibold text-white hover:bg-[#1c50c2]">다음</button>
                ) : (
                  <>
                    <button type="button" disabled={submitting || Boolean(validation)} onClick={() => void save(false)} className="h-10 rounded-[7px] border border-app-border px-4 text-[13px] font-medium text-app-text hover:bg-app-bg disabled:opacity-50">{submitting ? "저장 중…" : "설정 저장"}</button>
                    <button type="button" disabled={submitting || Boolean(validation)} onClick={() => void save(true)} className="h-10 rounded-[7px] bg-app-orange px-5 text-[13px] font-semibold text-white hover:bg-[#e5541f] disabled:opacity-50">{submitting ? "처리 중…" : "저장 후 크롤 시작"}</button>
                  </>
                )}
              </div>
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
