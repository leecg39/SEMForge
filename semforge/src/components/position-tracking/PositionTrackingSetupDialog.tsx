"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckIcon,
  Cross2Icon,
  DesktopIcon,
  FileTextIcon,
  MagnifyingGlassIcon,
  MobileIcon,
  PlusIcon,
  ReloadIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ClientApiError } from "@/lib/client-api";
import {
  MAX_TRACKING_KEYWORDS,
  mergeSetupKeywords,
  parseKeywordCsv,
  parseKeywordText,
  type SetupKeyword,
} from "@/lib/position-tracking/keywords";
import {
  defaultTrackingLocation,
  searchTrackingLocations,
  TRACKING_LOCATIONS,
} from "@/lib/position-tracking/locations";
import type { TrackingTargetType } from "@/lib/position-tracking/targets";
import { cn } from "@/lib/utils";

type Engine = "google" | "bing" | "chatgpt" | "gemini";
type Device = "desktop" | "mobile" | "tablet";

interface Capabilities {
  engines: Record<Engine, { enabled: boolean; reason: string | null }>;
  devices: Record<Device, { enabled: boolean; reason: string | null }>;
}

interface GbpLocation {
  name: string;
  title: string;
  address: string | null;
}

const TARGET_OPTIONS: { value: TrackingTargetType; label: string; hint: string }[] = [
  { value: "root_domain", label: "루트 도메인", hint: "모든 서브도메인을 포함합니다." },
  { value: "subdomain", label: "서브도메인", hint: "선택한 호스트와 그 하위 호스트를 추적합니다." },
  { value: "exact_url", label: "정확한 URL", hint: "해당 페이지 URL만 추적합니다." },
  { value: "subfolder", label: "하위 폴더", hint: "해당 경로 아래의 모든 페이지를 추적합니다." },
];

const ENGINE_OPTIONS: { value: Engine; label: string }[] = [
  { value: "google", label: "Google" },
  { value: "bing", label: "Bing" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "gemini", label: "Gemini" },
];

export function PositionTrackingSetupDialog({
  open,
  onOpenChange,
  domain,
  folderId,
  campaignId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  folderId?: string | null;
  campaignId?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [targetType, setTargetType] = useState<TrackingTargetType>("root_domain");
  const [targetValue, setTargetValue] = useState(domain);
  const [engine, setEngine] = useState<Engine>("google");
  const [device, setDevice] = useState<Device>("desktop");
  const [locationKey, setLocationKey] = useState(defaultTrackingLocation(domain).key);
  const [locationQuery, setLocationQuery] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [gbpLocations, setGbpLocations] = useState<GbpLocation[]>([]);
  const [keywordText, setKeywordText] = useState("");
  const [commonTag, setCommonTag] = useState("");
  const [keywords, setKeywords] = useState<SetupKeyword[]>([]);
  const [keywordTab, setKeywordTab] = useState<"plain" | "tagged">("plain");
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(true);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loadingCapabilities, setLoadingCapabilities] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setTargetValue((value) => value || domain);
      setIdempotencyKey((value) => value || crypto.randomUUID());
      setLoadingCapabilities(true);
      void Promise.all([
        api.get<Capabilities>("/api/position-tracking/capabilities/")
          .then((response) => setCapabilities(response.data)),
        api.get<{ locations?: GbpLocation[] }>("/api/gbp/locations/")
          .then((response) => setGbpLocations(response.data.locations ?? []))
          .catch(() => setGbpLocations([])),
      ]).catch((caught) => {
        setError(caught instanceof ClientApiError ? caught.message : "설정 정보를 불러오지 못했습니다.");
      }).finally(() => setLoadingCapabilities(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [domain, open]);

  const filteredLocations = useMemo(
    () => searchTrackingLocations(locationQuery).slice(0, 8),
    [locationQuery]
  );
  const selectedLocation = TRACKING_LOCATIONS.find((location) => location.key === locationKey)!;
  const aiEngine = engine === "chatgpt" || engine === "gemini";
  const hasDraft = step === 2
    || keywords.length > 0
    || keywordText.trim().length > 0
    || targetValue !== domain
    || businessName.trim().length > 0;

  const requestOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (submitting) return;
    if (hasDraft && !window.confirm("입력한 포지션 추적 설정을 닫을까요? 저장하지 않은 내용은 유지되지 않을 수 있습니다.")) {
      return;
    }
    onOpenChange(false);
  };

  const addTypedKeywords = () => {
    const tags = keywordTab === "tagged" && commonTag.trim() ? [commonTag] : [];
    setKeywords((current) => mergeSetupKeywords(current, parseKeywordText(keywordText, tags)));
    setKeywordText("");
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = parseKeywordCsv(await file.text());
      setKeywords((current) => mergeSetupKeywords(current, imported));
      setError(imported.length === 0 ? "CSV에서 키워드를 찾지 못했습니다." : null);
    } catch {
      setError("CSV 파일을 읽지 못했습니다.");
    }
  };

  const submit = async () => {
    if (keywords.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post<{ campaignId: string; runId: string; total: number }>(
        "/api/position-tracking/setup/",
        {
          campaignId,
          folderId: folderId ?? null,
          domain,
          target: { type: targetType, value: targetValue },
          searchEngine: engine,
          device: aiEngine ? "desktop" : device,
          locationKey,
          businessName: businessName.trim() || null,
          keywords,
          weeklyDigestEnabled,
          idempotencyKey,
        }
      );
      onOpenChange(false);
      router.push(
        `/position-tracking/?campaign=${encodeURIComponent(response.data.campaignId)}&run=${encodeURIComponent(response.data.runId)}`
      );
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "포지션 추적 설정을 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={requestOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-[#171923]/55 backdrop-blur-[1px]" />
        <Dialog.Content
          aria-describedby="position-tracking-setup-description"
          className="fixed left-1/2 top-1/2 z-[81] flex h-[min(760px,92vh)] w-[min(1120px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[12px] bg-white shadow-[0_24px_70px_rgba(12,18,31,.35)] outline-none"
        >
          <aside className="hidden w-[236px] shrink-0 bg-[#17181c] px-5 py-8 text-white sm:block">
            <Dialog.Title className="text-[17px] font-semibold leading-[24px]">
              새로운 포지션 추적 캠페인
            </Dialog.Title>
            <Dialog.Description id="position-tracking-setup-description" className="mt-2 text-[12px] leading-[18px] text-white/60">
              실제 검색·AI 인용 순위를 수집합니다.
            </Dialog.Description>
            <ol className="mt-8 space-y-2">
              {[
                { number: 1, label: "타겟팅" },
                { number: 2, label: "키워드", meta: `${keywords.length}/${MAX_TRACKING_KEYWORDS}` },
              ].map((item) => (
                <li key={item.number}>
                  <button
                    type="button"
                    onClick={() => item.number === 1 && setStep(1)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[7px] px-3 py-3 text-left text-[14px]",
                      step === item.number ? "bg-white/14 font-semibold" : "text-white/70"
                    )}
                  >
                    <span className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full border text-[12px]",
                      step === item.number ? "border-white bg-white text-[#17181c]" : "border-white/40"
                    )}>
                      {step > item.number ? <CheckIcon /> : item.number}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.meta && <span className="text-[11px] text-white/55">{item.meta}</span>}
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-app-border px-5">
              <div>
                <p className="text-[15px] font-semibold text-app-text">
                  {step === 1 ? "타겟팅 설정" : "추적 키워드 추가"}
                </p>
                <p className="text-[11px] text-app-text-secondary">{domain}</p>
              </div>
              <Dialog.Close asChild>
                <button type="button" aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-app-bg">
                  <Cross2Icon />
                </button>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
              {loadingCapabilities && (
                <div className="mb-4 flex items-center gap-2 rounded-[7px] bg-[#f2f7fd] px-3 py-2 text-[12px] text-[#235c85]">
                  <ReloadIcon className="animate-spin" /> 공급자 기능을 확인하고 있습니다…
                </div>
              )}

              {step === 1 ? (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-[13px] font-semibold text-app-text">추적 대상</h3>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {TARGET_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setTargetType(option.value);
                            setTargetValue(option.value === "root_domain" ? domain.replace(/^www\./i, "") : domain);
                          }}
                          className={cn(
                            "rounded-[8px] border p-3 text-left",
                            targetType === option.value ? "border-app-blue bg-[#eef5ff]" : "border-app-border hover:bg-app-bg"
                          )}
                        >
                          <span className="block text-[13px] font-semibold text-app-text">{option.label}</span>
                          <span className="mt-1 block text-[11px] leading-[16px] text-app-text-secondary">{option.hint}</span>
                        </button>
                      ))}
                    </div>
                    <input
                      value={targetValue}
                      onChange={(event) => setTargetValue(event.target.value)}
                      className="mt-2 h-10 w-full rounded-[7px] border border-app-border px-3 text-[13px] outline-none focus:border-app-blue"
                      placeholder={targetType === "exact_url" || targetType === "subfolder" ? `https://${domain}/path` : domain}
                    />
                  </section>

                  <section>
                    <h3 className="text-[13px] font-semibold text-app-text">검색 엔진</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ENGINE_OPTIONS.map((option) => {
                        const capability = capabilities?.engines[option.value];
                        const disabled = capability ? !capability.enabled : true;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={disabled}
                            title={capability?.reason ?? undefined}
                            onClick={() => {
                              setEngine(option.value);
                              if (option.value === "chatgpt" || option.value === "gemini") setDevice("desktop");
                            }}
                            className={cn(
                              "h-9 rounded-full border px-4 text-[12px] font-medium",
                              engine === option.value ? "border-[#17181c] bg-[#17181c] text-white" : "border-app-border bg-white text-app-text",
                              disabled && "cursor-not-allowed opacity-45"
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    {capabilities?.engines[engine]?.reason && (
                      <p className="mt-2 text-[11px] text-app-red">{capabilities.engines[engine].reason}</p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-[13px] font-semibold text-app-text">기기</h3>
                    {aiEngine ? (
                      <p className="mt-2 rounded-[7px] bg-app-bg px-3 py-2 text-[12px] text-app-text-secondary">
                        AI 답변에는 기기별 검색 순위가 적용되지 않습니다. 위치는 답변 문맥으로만 사용합니다.
                      </p>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        {([
                          ["desktop", "데스크톱", DesktopIcon],
                          ["mobile", "모바일", MobileIcon],
                          ["tablet", "태블릿", FileTextIcon],
                        ] as const).map(([value, label, Icon]) => {
                          const capability = capabilities?.devices[value];
                          const disabled = capability ? !capability.enabled : true;
                          return (
                            <button
                              key={value}
                              type="button"
                              disabled={disabled}
                              title={capability?.reason ?? undefined}
                              onClick={() => setDevice(value)}
                              className={cn(
                                "flex h-9 items-center gap-2 rounded-[7px] border px-3 text-[12px]",
                                device === value ? "border-app-blue bg-[#eef5ff] text-app-blue" : "border-app-border",
                                disabled && "cursor-not-allowed opacity-45"
                              )}
                            >
                              <Icon /> {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <h3 className="text-[13px] font-semibold text-app-text">위치</h3>
                      <label className="mt-2 flex h-10 items-center gap-2 rounded-[7px] border border-app-border px-3">
                        <MagnifyingGlassIcon className="text-app-text-secondary" />
                        <input
                          value={locationQuery}
                          onChange={(event) => setLocationQuery(event.target.value)}
                          className="min-w-0 flex-1 text-[13px] outline-none"
                          placeholder={selectedLocation.label}
                        />
                      </label>
                      <div className="mt-1 max-h-36 overflow-y-auto rounded-[7px] border border-app-border bg-white">
                        {filteredLocations.map((location) => (
                          <button
                            key={location.key}
                            type="button"
                            onClick={() => {
                              setLocationKey(location.key);
                              setLocationQuery("");
                            }}
                            className={cn(
                              "flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-app-bg",
                              location.key === locationKey && "bg-[#eef5ff] text-app-blue"
                            )}
                          >
                            {location.label}<span className="text-[10px] text-app-text-secondary">{location.countryCode}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-app-text">검색량 표시</h3>
                      <div className="mt-2 rounded-[7px] border border-app-border px-3 py-2.5 text-[12px]">
                        국가: {selectedLocation.country} ({selectedLocation.countryCode})
                      </div>
                      <p className="mt-1 text-[11px] text-app-text-secondary">도시별 검색량은 현재 제공되지 않습니다.</p>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[13px] font-semibold text-app-text">로컬 사업체명 <span className="font-normal text-app-text-secondary">(선택)</span></h3>
                    <input
                      list="position-tracking-gbp-locations"
                      value={businessName}
                      onChange={(event) => setBusinessName(event.target.value)}
                      className="mt-2 h-10 w-full rounded-[7px] border border-app-border px-3 text-[13px] outline-none focus:border-app-blue"
                      placeholder="Google Business Profile 업체명 또는 직접 입력"
                    />
                    <datalist id="position-tracking-gbp-locations">
                      {gbpLocations.map((location) => <option key={location.name} value={location.title}>{location.address ?? ""}</option>)}
                    </datalist>
                  </section>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex gap-1 rounded-[7px] bg-app-bg p-1">
                      <button type="button" onClick={() => setKeywordTab("plain")} className={cn("rounded-[5px] px-3 py-1.5 text-[12px]", keywordTab === "plain" && "bg-white font-semibold shadow-sm")}>키워드만</button>
                      <button type="button" onClick={() => setKeywordTab("tagged")} className={cn("rounded-[5px] px-3 py-1.5 text-[12px]", keywordTab === "tagged" && "bg-white font-semibold shadow-sm")}>태그 키워드</button>
                    </div>
                    <span className="text-[12px] font-medium text-app-text-secondary">{keywords.length}/{MAX_TRACKING_KEYWORDS}</span>
                  </div>
                  {keywordTab === "tagged" && (
                    <input value={commonTag} onChange={(event) => setCommonTag(event.target.value)} className="mt-3 h-9 w-full rounded-[7px] border border-app-border px-3 text-[12px]" placeholder="추가할 공통 태그" />
                  )}
                  <textarea
                    value={keywordText}
                    onChange={(event) => setKeywordText(event.target.value)}
                    className="mt-3 min-h-32 w-full resize-y rounded-[8px] border border-app-border p-3 text-[13px] leading-[20px] outline-none focus:border-app-blue"
                    placeholder="키워드를 한 줄에 하나씩 또는 쉼표로 구분해 입력하세요."
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={addTypedKeywords} disabled={!keywordText.trim() || keywords.length >= MAX_TRACKING_KEYWORDS} className="flex h-9 items-center gap-2 rounded-[7px] bg-[#17181c] px-4 text-[12px] font-semibold text-white disabled:opacity-45"><PlusIcon /> 캠페인에 키워드 추가</button>
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex h-9 items-center gap-2 rounded-[7px] border border-app-border px-3 text-[12px]"><FileTextIcon /> CSV 가져오기</button>
                    <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={importCsv} className="sr-only" />
                    {keywords.length > 0 && <button type="button" onClick={() => setKeywords([])} className="ml-auto text-[12px] text-app-red">전체 삭제</button>}
                  </div>

                  <div className="mt-5 overflow-hidden rounded-[8px] border border-app-border">
                    <div className="grid grid-cols-[1fr_1fr_44px] bg-app-bg px-3 py-2 text-[11px] font-medium text-app-text-secondary">
                      <span>키워드</span><span>태그</span><span />
                    </div>
                    {keywords.length === 0 ? (
                      <p className="px-3 py-10 text-center text-[12px] text-app-text-secondary">추적할 키워드를 추가해 주세요.</p>
                    ) : keywords.map((row, index) => (
                      <div key={`${row.keyword}-${index}`} className="grid grid-cols-[1fr_1fr_44px] items-center border-t border-app-border px-3 py-2 text-[12px]">
                        <span className="truncate font-medium text-app-text">{row.keyword}</span>
                        <input
                          value={row.tags.join(", ")}
                          onChange={(event) => setKeywords((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20) } : item))}
                          className="mr-2 h-8 rounded-[6px] border border-app-border px-2 text-[11px]"
                          placeholder="태그"
                        />
                        <button type="button" aria-label={`${row.keyword} 삭제`} onClick={() => setKeywords((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="flex h-8 w-8 items-center justify-center rounded-full text-app-text-secondary hover:bg-app-bg hover:text-app-red"><TrashIcon /></button>
                      </div>
                    ))}
                  </div>

                  <label className="mt-4 flex items-start gap-2 text-[12px] text-app-text">
                    <input type="checkbox" checked={weeklyDigestEnabled} onChange={(event) => setWeeklyDigestEnabled(event.target.checked)} className="mt-0.5" />
                    <span>매주 자동으로 순위를 다시 수집하고 앱 내 요약 알림을 받습니다.</span>
                  </label>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-app-border px-5 py-3 sm:px-8">
              {error && <p role="alert" className="mb-2 text-[12px] text-app-red">{error}</p>}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => step === 2 ? setStep(1) : requestOpenChange(false)} className="h-9 rounded-[7px] border border-app-border px-4 text-[12px] font-medium">{step === 2 ? "이전" : "취소"}</button>
                {step === 1 ? (
                  <button type="button" disabled={!targetValue.trim() || !capabilities?.engines[engine].enabled} onClick={() => setStep(2)} className="h-9 rounded-[7px] bg-[#17181c] px-5 text-[12px] font-semibold text-white disabled:opacity-45">키워드 설정</button>
                ) : (
                  <button type="button" disabled={submitting || keywords.length === 0} onClick={() => void submit()} className="flex h-9 items-center gap-2 rounded-[7px] bg-[#22a06b] px-5 text-[12px] font-semibold text-white disabled:opacity-45">
                    {submitting && <ReloadIcon className="animate-spin" />} {submitting ? "캠페인 생성 중…" : "추적 시작"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
