"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  Cross2Icon,
  DesktopIcon,
  MagnifyingGlassIcon,
  MobileIcon,
  ReloadIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";

export interface OrganicResearchSetupKeyword {
  id: string;
  keyword: string;
  url: string;
  source: "auto" | "direct" | "file" | "gsc" | "organic";
}

export interface OrganicResearchSetupSummary {
  domain: string;
  country: string;
  region: string;
  city: string;
  device: "desktop" | "mobile";
  userAgent: "desktop" | "mobile";
  cadence: "weekly" | "none";
  emailUpdates: boolean;
  keywordCount: number;
  savedAt: string;
}

interface Suggestion {
  keyword: string;
  url: string;
}

type WizardStep = 1 | 2 | 3;
type KeywordSource = OrganicResearchSetupKeyword["source"];

const COUNTRY_OPTIONS = [
  { code: "KR", label: "South Korea" },
  { code: "US", label: "United States" },
  { code: "JP", label: "Japan" },
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
];

const REGION_OPTIONS: Record<string, string[]> = {
  KR: ["Seoul", "Busan", "Incheon", "Gyeonggi-do"],
  US: ["California", "New York", "Texas", "Washington"],
  JP: ["Tokyo", "Osaka", "Kanagawa"],
  GB: ["England", "Scotland", "Wales"],
  DE: ["Berlin", "Bavaria", "Hamburg"],
};

const SOURCE_TABS: Array<{ value: KeywordSource; label: string }> = [
  { value: "auto", label: "자동 가져오기" },
  { value: "direct", label: "직접" },
  { value: "file", label: "파일" },
  { value: "gsc", label: "GSC" },
  { value: "organic", label: "자연검색 리서치" },
];

/** 자동 가져오기 후보는 실제 수집된 리포트의 상위 키워드만 사용한다 — 가짜 추천 키워드를 채우지 않는다. */
function buildRows(domain: string, suggestions: Suggestion[]): OrganicResearchSetupKeyword[] {
  const sourceRows = suggestions
    .filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.keyword.toLowerCase() === item.keyword.toLowerCase()) === index,
    )
    .slice(0, 7);

  return sourceRows.map((item, index) => ({
    id: `${index}-${item.keyword}`,
    keyword: item.keyword,
    url: item.url || `https://${domain}/`,
    source: "auto",
  }));
}

function StepNavigation({ step }: { step: WizardStep }) {
  const steps = [
    { number: 1, label: "페이지 및 타겟 키워드" },
    { number: 2, label: "크롤러 사용자 에이전트" },
    { number: 3, label: "스케줄" },
  ] as const;

  return (
    <aside className="w-[220px] shrink-0 bg-[#4d1da8] px-3 py-10 text-white">
      <h2 className="px-5 text-[16px] font-semibold leading-[25px]">
        페이지 SEO 분석 도구 설정
      </h2>
      <ol className="mt-6 space-y-1.5">
        {steps.map((item) => {
          const active = item.number === step;
          return (
            <li
              key={item.number}
              className={cn(
                "rounded-[7px] px-3 py-2.5 transition-colors",
                active && "bg-[#7a3de4]",
              )}
            >
              <div className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[14px] font-bold">
                  {item.number}
                </span>
                <div>
                  <p className="text-[14px] font-semibold leading-[20px]">{item.label}</p>
                  <p className="mt-0.5 text-[13px] leading-[18px] text-white/75">
                    {item.number > 1 && item.number >= step ? "선택사항" : ""}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function TargetSelector({
  country,
  region,
  city,
  device,
  onCountryChange,
  onRegionChange,
  onCityChange,
  onDeviceChange,
}: {
  country: string;
  region: string;
  city: string;
  device: "desktop" | "mobile";
  onCountryChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onDeviceChange: (value: "desktop" | "mobile") => void;
}) {
  const [open, setOpen] = useState(true);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const countryLabel = COUNTRY_OPTIONS.find((item) => item.code === country)?.label ?? "South Korea";
  const filteredCountries = COUNTRY_OPTIONS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="relative mt-3 w-[320px] max-w-full">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full items-center justify-between rounded-[6px] border border-[#388fea] bg-white px-3 text-[14px] text-[#25282f] shadow-sm"
      >
        <span className="flex min-w-0 items-center gap-2">
          {device === "desktop" ? <DesktopIcon /> : <MobileIcon />}
          <span className="truncate">{city || region || countryLabel}</span>
        </span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-20 w-full rounded-[6px] border border-[#d5d8df] bg-white p-4 shadow-[0_8px_22px_rgba(23,27,38,0.16)]">
          <p className="mb-2 text-[13px] font-medium text-[#30333a]">국가</p>
          <div className="relative">
            <button
              type="button"
              aria-expanded={countryMenuOpen}
              onClick={() => setCountryMenuOpen((value) => !value)}
              className="flex h-10 w-full items-center justify-between rounded-[6px] border border-[#b9bec8] px-3 text-left text-[14px]"
            >
              {countryLabel}
              <ChevronDownIcon />
            </button>
            {countryMenuOpen && (
              <div className="absolute left-0 top-10 z-30 w-full rounded-b-[6px] border border-[#9fb9dc] bg-white shadow-lg">
                <label className="m-1 flex h-9 items-center gap-2 border border-[#4b9dec] px-2">
                  <MagnifyingGlassIcon className="text-[#858996]" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="min-w-0 flex-1 text-[13px] outline-none"
                    placeholder="국가 검색"
                  />
                </label>
                <ul className="max-h-40 overflow-y-auto py-1">
                  {filteredCountries.map((item) => (
                    <li key={item.code}>
                      <button
                        type="button"
                        onClick={() => {
                          onCountryChange(item.code);
                          onRegionChange("");
                          onCityChange("");
                          setCountryMenuOpen(false);
                          setQuery("");
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-[13px] hover:bg-[#eef7ff]",
                          item.code === country && "bg-[#dceeff]",
                        )}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <label className="mt-4 block text-[13px] font-medium text-[#30333a]">
            Region
            <select
              value={region}
              onChange={(event) => {
                onRegionChange(event.target.value);
                onCityChange("");
              }}
              className="mt-2 h-10 w-full rounded-[6px] border border-[#c9ccd3] bg-white px-3 text-[13px]"
            >
              <option value="">선택하기…</option>
              {(REGION_OPTIONS[country] ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block text-[13px] font-medium text-[#30333a]">
            시
            <select
              value={city}
              disabled={!region}
              onChange={(event) => onCityChange(event.target.value)}
              className="mt-2 h-10 w-full rounded-[6px] border border-[#c9ccd3] bg-white px-3 text-[13px] disabled:bg-[#f5f6f7] disabled:text-[#adb0b7]"
            >
              <option value="">선택하기…</option>
              {region && (
                <>
                  <option value={region}>{region}</option>
                  <option value={`${region} Central`}>{region} Central</option>
                </>
              )}
            </select>
          </label>

          <fieldset className="mt-4">
            <legend className="text-[13px] font-medium text-[#30333a]">기기</legend>
            <div className="mt-2 space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="radio"
                  checked={device === "desktop"}
                  onChange={() => onDeviceChange("desktop")}
                  className="h-4 w-4 accent-[#2f8ce9]"
                />
                <DesktopIcon /> 데스크톱
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="radio"
                  checked={device === "mobile"}
                  onChange={() => onDeviceChange("mobile")}
                  className="h-4 w-4 accent-[#2f8ce9]"
                />
                <MobileIcon /> 휴대전화
              </label>
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}

function KeywordTable({
  rows,
  onDelete,
}: {
  rows: OrganicResearchSetupKeyword[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mt-4 max-h-[410px] overflow-auto border-y border-[#d9dce2]">
      <table className="w-full table-fixed text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-[#f0f1f4] text-[#3f424a]">
          <tr>
            <th className="w-[22%] px-3 py-3 font-medium">키워드</th>
            <th className="w-[50%] px-3 py-3 font-medium">순위가 가장 높은 페이지</th>
            <th className="w-[22%] px-3 py-3 font-medium">키워드 소스</th>
            <th className="w-[6%] px-2 py-3"><span className="sr-only">삭제</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[#e1e3e7] first:border-t-0">
              <td className="truncate px-3 py-3.5 font-medium text-[#30333a]" title={row.keyword}>
                {row.keyword}
              </td>
              <td className="truncate px-3 py-3.5 text-[#30333a]" title={row.url}>
                {row.url}
              </td>
              <td className="px-3 py-3.5 text-[#30333a]">
                {row.source === "auto" || row.source === "organic"
                  ? "자연검색 리서치"
                  : row.source === "gsc"
                    ? "Google Search Console"
                    : row.source === "file"
                      ? "파일"
                      : "직접 입력"}
              </td>
              <td className="px-2 py-2 text-right">
                <button
                  type="button"
                  aria-label={`${row.keyword} 삭제`}
                  onClick={() => onDelete(row.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-[#6f737d] hover:bg-[#f1f2f4] hover:text-[#262930]"
                >
                  <TrashIcon />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="py-10 text-center text-[13px] text-[#747780]">수집할 키워드를 추가해 주세요.</p>
      )}
    </div>
  );
}

export function OrganicResearchSetupDialog({
  open,
  onOpenChange,
  domain,
  country: initialCountry,
  suggestions,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  country: string;
  suggestions: Suggestion[];
  onComplete: (summary: OrganicResearchSetupSummary) => void;
}) {
  const initialRows = useMemo(() => buildRows(domain, suggestions), [domain, suggestions]);
  const [step, setStep] = useState<WizardStep>(1);
  const [pageStage, setPageStage] = useState<"target" | "pages">("target");
  const [country, setCountry] = useState(initialCountry || "KR");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [source, setSource] = useState<KeywordSource>("auto");
  const [rows, setRows] = useState<OrganicResearchSetupKeyword[]>(initialRows);
  const [directKeyword, setDirectKeyword] = useState("");
  const [directUrl, setDirectUrl] = useState(`https://${domain}/`);
  const [userAgent, setUserAgent] = useState<"desktop" | "mobile">("desktop");
  const [cadence, setCadence] = useState<"weekly" | "none">("weekly");
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setStep(1);
      setPageStage("target");
      setCountry(initialCountry || "KR");
      setRegion("");
      setCity("");
      setDevice("desktop");
      setSource("auto");
      setRows(initialRows);
      setDirectKeyword("");
      setDirectUrl(`https://${domain}/`);
      setUserAgent("desktop");
      setCadence("weekly");
      setEmailUpdates(true);
      setSubmitting(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [domain, initialCountry, initialRows, open]);

  const selectSource = (nextSource: KeywordSource) => {
    setSource(nextSource);
    if (nextSource === "auto" || nextSource === "organic") {
      setRows(initialRows.map((row) => ({ ...row, source: nextSource })));
    }
    if (nextSource === "gsc") {
      // GSC 연동이 없으므로 가져온 척하는 키워드를 채우지 않는다.
      setRows([]);
    }
  };

  const addDirectKeyword = () => {
    const keyword = directKeyword.trim();
    const url = directUrl.trim();
    if (!keyword || !url) return;
    setRows((current) => [
      ...current,
      { id: `direct-${Date.now()}`, keyword, url, source: "direct" },
    ]);
    setDirectKeyword("");
  };

  const importFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const nextRows = String(reader.result ?? "")
        .split(/\r?\n/)
        .map((line) => line.split(","))
        .filter(([keyword]) => keyword?.trim())
        .slice(0, 50)
        .map(([keyword, url], index) => ({
          id: `file-${index}-${keyword}`,
          keyword: keyword.trim(),
          url: url?.trim() || `https://${domain}/`,
          source: "file" as const,
        }));
      setRows(nextRows);
    };
    reader.readAsText(file);
  };

  const finish = () => {
    setSubmitting(true);
    window.setTimeout(() => {
      onComplete({
        domain,
        country,
        region,
        city,
        device,
        userAgent,
        cadence,
        emailUpdates,
        keywordCount: rows.length,
        savedAt: new Date().toISOString(),
      });
      setSubmitting(false);
      onOpenChange(false);
    }, 650);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[700] bg-[#252a31]/72" />
        <Dialog.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[710] flex h-[min(700px,calc(100vh-56px))] w-[min(1012px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[7px] bg-white text-[#22252b] shadow-[0_30px_80px_rgba(0,0,0,0.35)] focus:outline-none"
        >
          <Dialog.Title className="sr-only">페이지 SEO 분석 도구 설정</Dialog.Title>
          <Dialog.Description className="sr-only">
            타겟 키워드, 크롤러 사용자 에이전트, 재수집 스케줄을 설정합니다.
          </Dialog.Description>

          <StepNavigation step={step} />

          <div className="relative flex min-w-0 flex-1 flex-col">
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="설정 닫기"
                className="absolute right-6 top-5 z-30 flex h-9 w-9 items-center justify-center rounded-full text-[#686c75] hover:bg-[#f1f2f4]"
              >
                <Cross2Icon className="h-6 w-6" />
              </button>
            </Dialog.Close>

            <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-5 pt-9">
              {step === 1 && pageStage === "target" && (
                <section>
                  <h3 className="text-[24px] font-semibold leading-[32px] tracking-[-0.35px]">
                    타겟 위치를 선택하세요
                  </h3>
                  <p className="mt-4 text-[15px] leading-[22px] text-[#3f434b]">
                    아이디어 수집을 시작하려면 타겟 위치를 선택하세요.
                  </p>
                  <div className="mt-5 flex items-start gap-2">
                    <div>
                      <p className="text-[14px] font-medium">Google 검색 타겟:</p>
                      <TargetSelector
                        country={country}
                        region={region}
                        city={city}
                        device={device}
                        onCountryChange={setCountry}
                        onRegionChange={setRegion}
                        onCityChange={setCity}
                        onDeviceChange={setDevice}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setPageStage("pages")}
                      className="mt-[35px] h-10 rounded-[6px] bg-[#2f997c] px-4 text-[14px] font-semibold text-white hover:bg-[#27836a]"
                    >
                      계속
                    </button>
                  </div>
                </section>
              )}

              {step === 1 && pageStage === "pages" && (
                <section>
                  <h3 className="text-[24px] font-semibold leading-[32px] tracking-[-0.35px]">
                    최적화할 페이지를 추가하세요
                  </h3>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap rounded-[6px] border border-[#afb4be] bg-white">
                      {SOURCE_TABS.map((tab) => (
                        <button
                          key={tab.value}
                          type="button"
                          onClick={() => selectSource(tab.value)}
                          className={cn(
                            "h-9 border-r border-[#c7cad1] px-3 text-[13px] last:border-r-0",
                            source === tab.value
                              ? "bg-[#e6f3ff] font-medium text-[#1d68aa]"
                              : "text-[#30333a] hover:bg-[#f5f6f8]",
                          )}
                        >
                          {tab.label}
                          {tab.value === "auto" ? ` ${initialRows.length}` : ""}
                        </button>
                      ))}
                    </div>
                    <div className="flex h-9 min-w-[230px] items-center gap-2 rounded-[6px] border border-[#c2c6ce] px-3 text-[13px]">
                      {device === "desktop" ? <DesktopIcon /> : <MobileIcon />}
                      <span className="flex-1">{COUNTRY_OPTIONS.find((item) => item.code === country)?.label}</span>
                      <ChevronDownIcon />
                    </div>
                  </div>

                  {source === "direct" && (
                    <div className="mt-4 grid gap-2 rounded-[6px] border border-[#d6d9df] bg-[#fafbfc] p-3 sm:grid-cols-[1fr_1.3fr_auto]">
                      <input
                        value={directKeyword}
                        onChange={(event) => setDirectKeyword(event.target.value)}
                        placeholder="키워드"
                        className="h-9 rounded-[5px] border border-[#c7cad1] bg-white px-3 text-[13px] outline-none focus:border-[#3c93e6]"
                      />
                      <input
                        value={directUrl}
                        onChange={(event) => setDirectUrl(event.target.value)}
                        placeholder="https://example.com/page"
                        className="h-9 rounded-[5px] border border-[#c7cad1] bg-white px-3 text-[13px] outline-none focus:border-[#3c93e6]"
                      />
                      <button
                        type="button"
                        onClick={addDirectKeyword}
                        className="h-9 rounded-[5px] bg-[#eef6ff] px-4 text-[13px] font-medium text-[#1268b3] hover:bg-[#deedfb]"
                      >
                        추가
                      </button>
                    </div>
                  )}

                  {source === "file" && (
                    <label className="mt-4 flex cursor-pointer items-center justify-between rounded-[6px] border border-dashed border-[#aeb4c0] bg-[#fafbfc] px-4 py-3 text-[13px] text-[#4a4e57]">
                      CSV 파일에서 `키워드, URL` 형식으로 가져오기
                      <span className="rounded-[5px] border border-[#bfc4cc] bg-white px-3 py-1.5 font-medium">파일 선택</span>
                      <input type="file" accept=".csv,text/csv" onChange={importFile} className="sr-only" />
                    </label>
                  )}

                  {(source === "gsc" || source === "organic") && (
                    <p className="mt-4 rounded-[6px] bg-[#f2f8fd] px-4 py-3 text-[13px] text-[#3e4e5c]">
                      {source === "gsc"
                        ? "연결된 Search Console이 없습니다. GSC를 연동하면 성과가 높은 키워드를 가져올 수 있습니다."
                        : "현재 유기 연구 리포트에서 순위가 높은 키워드를 불러왔습니다."}
                    </p>
                  )}

                  <KeywordTable
                    rows={rows}
                    onDelete={(id) => setRows((current) => current.filter((row) => row.id !== id))}
                  />
                </section>
              )}

              {step === 2 && (
                <section>
                  <h3 className="text-[24px] font-semibold leading-[32px] tracking-[-0.35px]">
                    사용자 에이전트를 선택하세요
                  </h3>
                  <p className="mt-4 text-[15px] leading-[22px] text-[#3f434b]">
                    사이트를 크롤링할 사용자 에이전트를 선택하세요.
                  </p>
                  <p className="mt-5 text-[14px] font-semibold">이 단계는 건너뛰셔도 됩니다.</p>
                  <select
                    aria-label="크롤러 사용자 에이전트"
                    value={userAgent}
                    onChange={(event) => setUserAgent(event.target.value as "desktop" | "mobile")}
                    className="mt-5 h-10 w-[220px] rounded-[6px] border border-[#b9bec8] bg-[#f6f7f8] px-3 text-[14px]"
                  >
                    <option value="desktop">SEMForgeBot-Desktop</option>
                    <option value="mobile">SEMForgeBot-Mobile</option>
                  </select>
                  <p className="mt-3 text-[13px] text-[#3f434b]">
                    {userAgent === "desktop"
                      ? "Mozilla/5.0 (compatible; SEMForgeBot-SI/0.97)"
                      : "Mozilla/5.0 (Linux; Android 13; Mobile; compatible; SEMForgeBot-SI/0.97)"}
                  </p>
                </section>
              )}

              {step === 3 && (
                <section>
                  <h3 className="text-[24px] font-semibold leading-[32px] tracking-[-0.35px]">
                    아이디어를 재수집해야 하는 빈도
                  </h3>
                  <p className="mt-4 text-[14px] font-semibold">이 단계는 건너뛰셔도 됩니다.</p>
                  <fieldset className="mt-6 space-y-4">
                    <legend className="sr-only">아이디어 재수집 주기</legend>
                    <div className="flex flex-wrap items-center gap-7">
                      <label className="flex cursor-pointer items-center gap-2 text-[14px]">
                        <input
                          type="radio"
                          checked={cadence === "weekly"}
                          onChange={() => setCadence("weekly")}
                          className="h-4 w-4 accent-[#388fe8]"
                        />
                        주간
                      </label>
                      <span className="h-7 w-px bg-[#cfd2d8]" aria-hidden="true" />
                      <label className="flex cursor-pointer items-center gap-2 text-[14px]">
                        <input
                          type="checkbox"
                          checked={emailUpdates}
                          disabled={cadence === "none"}
                          onChange={(event) => setEmailUpdates(event.target.checked)}
                          className="h-4 w-4 rounded accent-[#388fe8]"
                        />
                        매주 월요일에 이메일 업데이트 받기
                      </label>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-[14px]">
                      <input
                        type="radio"
                        checked={cadence === "none"}
                        onChange={() => setCadence("none")}
                        className="h-4 w-4 accent-[#388fe8]"
                      />
                      없음
                    </label>
                  </fieldset>
                </section>
              )}
            </div>

            <footer className="relative flex min-h-[76px] items-center justify-between px-10 pb-7">
              <div>
                {step === 1 && pageStage === "target" ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 1) setPageStage("target");
                      else setStep((step - 1) as WizardStep);
                    }}
                    className="inline-flex items-center gap-2 text-[14px] font-medium text-[#1472bd] hover:underline"
                  >
                    <ArrowLeftIcon />
                    {step === 1 ? "타겟 위치" : step === 2 ? "페이지 및 타겟 키워드" : "크롤러 사용자 에이전트"}
                  </button>
                )}
              </div>

              {!(step === 1 && pageStage === "target") && (
                <div className="absolute left-1/2 -translate-x-1/2 text-center">
                  <p className="mb-3 text-[14px]">유닛 필요: <strong>{rows.length}</strong></p>
                {step === 1 && pageStage === "pages" ? (
                  <button
                    type="button"
                    disabled={rows.length === 0 || submitting}
                    onClick={() => {
                      setSubmitting(true);
                      window.setTimeout(() => {
                        setSubmitting(false);
                        setStep(2);
                      }, 550);
                    }}
                    className="inline-flex h-11 min-w-[130px] items-center justify-center rounded-[6px] bg-[#2f997c] px-5 text-[14px] font-semibold text-white hover:bg-[#27836a] disabled:opacity-50"
                  >
                    {submitting ? <ReloadIcon className="h-5 w-5 animate-spin" /> : "아이디어 수집"}
                  </button>
                ) : step === 2 ? (
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="inline-flex h-11 min-w-[130px] items-center justify-center rounded-[6px] bg-[#2f997c] px-5 text-[14px] font-semibold text-white hover:bg-[#27836a]"
                  >
                    스케줄
                  </button>
                ) : step === 3 ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={finish}
                    className="inline-flex h-11 min-w-[130px] items-center justify-center rounded-[6px] bg-[#2f997c] px-5 text-[14px] font-semibold text-white hover:bg-[#27836a] disabled:cursor-wait disabled:opacity-70"
                  >
                    {submitting ? <ReloadIcon className="h-5 w-5 animate-spin" /> : "설정 완료"}
                  </button>
                  ) : null}
                </div>
              )}

              <div>
                {step === 1 && (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-2 text-[14px] font-medium text-[#1472bd] hover:underline"
                  >
                    크롤러 사용자 에이전트 <ArrowRightIcon />
                  </button>
                )}
                {step === 2 && (
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="inline-flex items-center gap-2 text-[14px] font-medium text-[#1472bd] hover:underline"
                  >
                    스케줄 <ArrowRightIcon />
                  </button>
                )}
              </div>
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
