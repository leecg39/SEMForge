"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, Cross2Icon, ReloadIcon } from "@radix-ui/react-icons";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/LocaleProvider";
import type {
  AdCampaignDraft,
  AdvertisingGoal,
  AdvertisingMatchType,
  AdvertisingPlatform,
  CampaignCreativeInput,
  CampaignKeywordInput,
} from "@/server/advertising/contracts";

const steps = [
  "웹사이트",
  "플랫폼",
  "목표·지역",
  "예산",
  "광고 그룹·키워드",
  "광고 문구",
  "검토",
] as const;

const fieldClass =
  "mt-1.5 h-10 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] outline-none transition focus:border-app-blue focus:ring-2 focus:ring-app-blue/10";
const cardClass = "rounded-[10px] border border-app-border bg-white";

type FormState = {
  name: string;
  domain: string;
  platform: AdvertisingPlatform;
  goal: AdvertisingGoal;
  countryCode: string;
  languageCode: string;
  dailyBudgetCents: number;
  currencyCode: string;
  adGroupName: string;
  finalUrl: string;
  keywords: CampaignKeywordInput[];
  creative: CampaignCreativeInput;
};

function normalizeDomain(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./, "");
  }
}

function initialForm(domainValue: string, ko = true): FormState {
  const domain = normalizeDomain(domainValue);
  const finalUrl = domain ? `https://${domain}` : "";
  return {
    name: domain ? `${domain} ${ko ? "광고 캠페인" : "ad campaign"}` : (ko ? "새 광고 캠페인" : "New ad campaign"),
    domain,
    platform: "google",
    goal: "sales",
    countryCode: "KR",
    languageCode: "ko",
    dailyBudgetCents: 30000,
    currencyCode: "KRW",
    adGroupName: ko ? "기본 광고 그룹" : "Default ad group",
    finalUrl,
    keywords: [],
    creative: {
      headlines: ["", "", ""],
      descriptions: ["", ""],
      primaryText: "",
      path1: "",
      path2: "",
      callToAction: ko ? "자세히 보기" : "Learn more",
      finalUrl,
    },
  };
}

function formFromCampaign(campaign: AdCampaignDraft): FormState {
  return {
    name: campaign.name,
    domain: campaign.domain,
    platform: campaign.platform,
    goal: campaign.goal,
    countryCode: campaign.countryCode,
    languageCode: campaign.languageCode,
    dailyBudgetCents: campaign.dailyBudgetCents,
    currencyCode: campaign.currencyCode,
    adGroupName: campaign.adGroup.name,
    finalUrl: campaign.adGroup.finalUrl,
    keywords: campaign.keywords,
    creative: {
      ...campaign.creative,
      headlines: [...campaign.creative.headlines, "", "", ""].slice(0, Math.max(3, campaign.creative.headlines.length)),
      descriptions: [...campaign.creative.descriptions, "", ""].slice(0, Math.max(2, campaign.creative.descriptions.length)),
    },
  };
}

function messageFor(error: unknown): string {
  if (error instanceof ClientApiError) return error.message;
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function googleUnits(value: string): number {
  return Array.from(value).reduce((total, character) =>
    total + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1), 0);
}

function cleanedCreative(form: FormState): CampaignCreativeInput {
  return {
    ...form.creative,
    headlines: form.creative.headlines.map((value) => value.trim()).filter(Boolean),
    descriptions: form.creative.descriptions.map((value) => value.trim()).filter(Boolean),
    finalUrl: form.finalUrl,
  };
}

function formPayload(form: FormState, folderId: string | null, requestId?: string) {
  return {
    folderId,
    ...(requestId ? { requestId } : {}),
    name: form.name,
    domain: form.domain,
    platform: form.platform,
    goal: form.goal,
    countryCode: form.countryCode,
    languageCode: form.languageCode,
    dailyBudgetCents: form.dailyBudgetCents,
    currencyCode: form.currencyCode,
    adGroupName: form.adGroupName,
    finalUrl: form.finalUrl,
    keywords: form.keywords,
    creative: cleanedCreative(form),
  };
}

function Limit({ value, max }: { value: string; max: number }) {
  const units = googleUnits(value);
  return (
    <span className={cn("text-[11px]", units > max ? "font-semibold text-app-red" : "text-app-text-secondary")}>
      {units}/{max}
    </span>
  );
}

export function AdvertisingCampaignWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const localizedSteps = ko
    ? steps
    : ["Website", "Platform", "Goal & region", "Budget", "Ad group & keywords", "Ad copy", "Review"];
  const folderId = searchParams.get("fid");
  const campaignIdFromUrl = searchParams.get("campaign");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => initialForm(searchParams.get("domain") ?? "", ko));
  const [campaign, setCampaign] = useState<AdCampaignDraft | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordNegative, setKeywordNegative] = useState(false);
  const [loading, setLoading] = useState(Boolean(campaignIdFromUrl));
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "retry">("idle");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string>("");
  const savingRef = useRef(false);
  const lastSavedRef = useRef("");

  useEffect(() => {
    requestIdRef.current ||= typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `campaign-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);

  const loadCampaign = useCallback(async (id: string, replaceForm = true) => {
    const { data } = await api.get<AdCampaignDraft>(`/api/advertising/campaigns/${id}/`);
    setCampaign(data);
    if (replaceForm) setForm(formFromCampaign(data));
    lastSavedRef.current = JSON.stringify(formPayload(formFromCampaign(data), data.folderId));
    return data;
  }, [setCampaign, setForm]);

  useEffect(() => {
    if (!campaignIdFromUrl) return;
    let cancelled = false;
    api.get<AdCampaignDraft>(`/api/advertising/campaigns/${campaignIdFromUrl}/`)
      .then(({ data }) => {
        if (cancelled) return;
        const restored = formFromCampaign(data);
        setCampaign(data);
        setForm(restored);
        lastSavedRef.current = JSON.stringify(formPayload(restored, data.folderId));
      })
      .catch((cause) => {
        if (!cancelled) setError(messageFor(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [campaignIdFromUrl]);

  const payloadSignature = useMemo(
    () => JSON.stringify(formPayload(form, folderId)),
    [folderId, form],
  );

  const saveDraft = useCallback(async (
    status?: "draft" | "ready",
    formOverride?: FormState,
  ) => {
    if (savingRef.current) return null;
    const draftForm = formOverride ?? form;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      if (!campaign) {
        const payload = { ...formPayload(draftForm, folderId, requestIdRef.current), status: status ?? "draft" };
        const { data } = await api.post<AdCampaignDraft>("/api/advertising/campaigns/", payload);
        setCampaign(data);
        setForm(formFromCampaign(data));
        lastSavedRef.current = JSON.stringify(formPayload(formFromCampaign(data), data.folderId));
        const params = new URLSearchParams(searchParams.toString());
        params.set("campaign", data.id);
        params.set("domain", data.domain);
        router.replace(`/advertising/ads-launch-assistant/?${params.toString()}`);
        setSaveState("saved");
        return data;
      }
      const payload = {
        ...formPayload(draftForm, folderId),
        ...(status ? { status } : {}),
        version: campaign.version,
      };
      const { data } = await api.patch<AdCampaignDraft>(
        `/api/advertising/campaigns/${campaign.id}/`,
        payload,
      );
      setCampaign(data);
      lastSavedRef.current = JSON.stringify(formPayload(draftForm, folderId));
      setSaveState("saved");
      return data;
    } catch (cause) {
      if (cause instanceof ClientApiError && cause.code === "VERSION_CONFLICT" && campaign) {
        await loadCampaign(campaign.id);
      }
      setSaveState("retry");
      setError(messageFor(cause));
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [campaign, folderId, form, loadCampaign, router, searchParams, setCampaign, setError, setForm, setSaveState, setSaving]);

  useEffect(() => {
    if (!campaign || payloadSignature === lastSavedRef.current || savingRef.current) return;
    setSaveState("idle");
    const timer = setTimeout(() => { void saveDraft(); }, 1200);
    return () => clearTimeout(timer);
  }, [campaign, payloadSignature, saveDraft]);

  const validateStep = (): string | null => {
    if (step === 0 && (!normalizeDomain(form.domain).includes(".") || !form.name.trim())) {
      return "캠페인 이름과 올바른 도메인을 입력해 주세요.";
    }
    if (step === 3 && form.dailyBudgetCents <= 0) return "일일 예산은 0보다 커야 합니다.";
    if (step === 4) {
      try {
        const url = new URL(form.finalUrl);
        if (!/^https?:$/.test(url.protocol)) throw new Error();
      } catch {
        return "올바른 HTTP(S) 랜딩 URL을 입력해 주세요.";
      }
    }
    if (step === 5 && form.platform === "google") {
      const headlines = cleanedCreative(form).headlines;
      const descriptions = cleanedCreative(form).descriptions;
      if (!headlines.length || !descriptions.length) return "헤드라인과 설명을 각각 하나 이상 입력해 주세요.";
      if (headlines.some((value) => googleUnits(value) > 30)) return "Google 헤드라인 규격(30자)을 확인해 주세요.";
      if (descriptions.some((value) => googleUnits(value) > 90)) return "Google 설명 규격(90자)을 확인해 주세요.";
    }
    return null;
  };

  const next = async () => {
    const issue = validateStep();
    if (issue) {
      setError(issue);
      return;
    }
    let formToSave = form;
    if (step === 0) {
      const domain = normalizeDomain(form.domain);
      const finalUrl = form.finalUrl || `https://${domain}`;
      formToSave = {
        ...form,
        domain,
        finalUrl,
        creative: { ...form.creative, finalUrl },
      };
      setForm(formToSave);
    }
    const saved = await saveDraft(step === 5 ? "ready" : "draft", formToSave);
    if (saved || campaign) setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const addKeyword = () => {
    const values = keywordInput.split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
    if (!values.length) return;
    setForm((current) => ({
      ...current,
      keywords: [
        ...current.keywords,
        ...values.map((keyword) => ({ keyword, matchType: "phrase" as const, negative: keywordNegative, source: "manual" as const })),
      ].slice(0, 200),
    }));
    setKeywordInput("");
  };

  const updateCreative = (key: keyof CampaignCreativeInput, value: string | string[]) => {
    setForm((current) => ({ ...current, creative: { ...current.creative, [key]: value } }));
  };

  const generate = async () => {
    if (!campaign) return;
    setGenerating(true);
    setError(null);
    try {
      await saveDraft();
      const { data } = await api.post<AdCampaignDraft>(`/api/advertising/campaigns/${campaign.id}/generate/`);
      setCampaign(data);
      setForm(formFromCampaign(data));
      setSaveState("saved");
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center text-[13px] text-app-text-secondary"><ReloadIcon className="mr-2 animate-spin" /> {ko ? "캠페인 초안을 불러오는 중…" : "Loading campaign draft…"}</div>;
  }

  return (
    <div className="min-h-full bg-[#f5f6f7] p-4 text-app-text md:p-6">
      <div className="mx-auto max-w-[1120px]">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] text-app-text-secondary">{ko ? "광고 툴킷 · 실제 게시 전 검토용 초안" : "Advertising Toolkit · Reviewable draft before publishing"}</p>
            <h1 className="mt-1 text-[24px] font-semibold">{ko ? "광고 시작 도우미" : "Ads Launch Assistant"}</h1>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-app-text-secondary" aria-live="polite">
            {saving && <><ReloadIcon className="animate-spin" /> {ko ? "저장 중" : "Saving"}</>}
            {!saving && saveState === "saved" && <><CheckIcon className="text-app-green" /> {ko ? "자동 저장됨" : "Autosaved"}</>}
            {!saving && saveState === "retry" && (
              <button type="button" onClick={() => void saveDraft()} className="font-semibold text-app-red underline">{ko ? "저장 재시도" : "Retry save"}</button>
            )}
          </div>
        </header>

        <nav className={cn(cardClass, "mt-5 overflow-x-auto px-4 py-3")} aria-label={ko ? "캠페인 설정 단계" : "Campaign setup steps"}>
          <ol className="flex min-w-[760px] items-center">
            {localizedSteps.map((label, index) => (
              <li key={label} className="flex flex-1 items-center last:flex-none">
                <button
                  type="button"
                  disabled={index > step || (!campaign && index > 0)}
                  onClick={() => index <= step && setStep(index)}
                  className={cn("flex items-center gap-2 text-left text-[12px]", index === step ? "font-semibold text-app-text" : "text-app-text-secondary", index < step && "text-app-green")}
                >
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", index <= step ? "border-app-green bg-app-green text-white" : "border-app-border bg-white")}>
                    {index < step ? <CheckIcon /> : index + 1}
                  </span>
                  <span className="whitespace-nowrap">{label}</span>
                </button>
                {index < steps.length - 1 && <span className="mx-3 h-px min-w-3 flex-1 bg-app-border" />}
              </li>
            ))}
          </ol>
        </nav>

        {error && (
          <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-[8px] border border-[#f2b8b5] bg-[#fff4f3] px-4 py-3 text-[13px] text-app-red">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="오류 닫기"><Cross2Icon /></button>
          </div>
        )}

        <main className={cn(cardClass, "mt-4 p-5 md:p-7")}>
          {step === 0 && (
            <section>
              <h2 className="text-[18px] font-semibold">{ko ? "홍보할 웹사이트를 입력하세요" : "Enter the website you want to promote"}</h2>
              <p className="mt-1 text-[13px] text-app-text-secondary">{ko ? "사이트 문맥은 키워드와 광고 문구 제안의 근거로만 사용됩니다." : "Website context is used only as evidence for keyword and ad copy suggestions."}</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="text-[12px] font-medium">{ko ? "캠페인 이름" : "Campaign name"}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={fieldClass} /></label>
                <label className="text-[12px] font-medium">{ko ? "도메인" : "Domain"}<input value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} placeholder="example.com" className={fieldClass} /></label>
              </div>
              {folderId ? <p className="mt-4 text-[12px] text-app-text-secondary">{ko ? "현재 선택한 폴더에 연결됩니다. 폴더 연결은 나중에 변경할 수 있습니다." : "This draft will be linked to the selected folder. You can change it later."}</p> : <p className="mt-4 text-[12px] text-app-text-secondary">{ko ? "폴더를 선택하지 않아도 워크스페이스 초안으로 저장할 수 있습니다." : "You can save a workspace draft without selecting a folder."}</p>}
            </section>
          )}

          {step === 1 && (
            <section>
              <h2 className="text-[18px] font-semibold">{ko ? "광고 플랫폼을 선택하세요" : "Choose an advertising platform"}</h2>
              <p className="mt-1 text-[13px] text-app-text-secondary">{ko ? "MVP에서는 게시하지 않고 검토·내보내기 가능한 초안을 만듭니다." : "This MVP creates reviewable, exportable drafts and does not publish ads."}</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {(["google", "meta"] as const).map((platform) => (
                  <button key={platform} type="button" onClick={() => setForm({ ...form, platform })} className={cn("rounded-[10px] border p-5 text-left transition", form.platform === platform ? "border-app-blue bg-[#f3f8ff] ring-2 ring-app-blue/10" : "border-app-border hover:bg-[#fafafa]")}>
                    <span className="text-[15px] font-semibold">{platform === "google" ? (ko ? "Google 검색 광고" : "Google Search ads") : (ko ? "Meta 광고" : "Meta ads")}</span>
                    <span className="mt-2 block text-[12px] leading-5 text-app-text-secondary">{platform === "google" ? (ko ? "키워드, 반응형 검색 광고 헤드라인·설명 초안" : "Keyword, responsive search headline, and description drafts") : (ko ? "Facebook·Instagram용 기본 문구와 CTA 초안" : "Primary text and CTA drafts for Facebook and Instagram")}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <h2 className="text-[18px] font-semibold">{ko ? "목표와 타깃 지역을 정하세요" : "Set your goal and target region"}</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <label className="text-[12px] font-medium">{ko ? "캠페인 목표" : "Campaign goal"}<select value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value as AdvertisingGoal })} className={fieldClass}><option value="sales">{ko ? "판매" : "Sales"}</option><option value="leads">{ko ? "잠재고객" : "Leads"}</option><option value="traffic">{ko ? "웹사이트 트래픽" : "Website traffic"}</option><option value="awareness">{ko ? "인지도" : "Awareness"}</option></select></label>
                <label className="text-[12px] font-medium">{ko ? "국가" : "Country"}<select value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value })} className={fieldClass}><option value="KR">{ko ? "대한민국" : "South Korea"}</option><option value="US">{ko ? "미국" : "United States"}</option><option value="JP">{ko ? "일본" : "Japan"}</option><option value="SG">{ko ? "싱가포르" : "Singapore"}</option></select></label>
                <label className="text-[12px] font-medium">{ko ? "언어" : "Language"}<select value={form.languageCode} onChange={(event) => setForm({ ...form, languageCode: event.target.value })} className={fieldClass}><option value="ko">{ko ? "한국어" : "Korean"}</option><option value="en">{ko ? "영어" : "English"}</option><option value="ja">{ko ? "일본어" : "Japanese"}</option></select></label>
              </div>
            </section>
          )}

          {step === 3 && (
            <section>
              <h2 className="text-[18px] font-semibold">{ko ? "일일 예산을 입력하세요" : "Enter a daily budget"}</h2>
              <p className="mt-1 text-[13px] text-app-text-secondary">{ko ? "계정이 연결되지 않았으므로 성과·ROI 예측은 표시하지 않습니다." : "No performance or ROI forecasts are shown before an ad account is connected."}</p>
              <div className="mt-6 grid max-w-[520px] grid-cols-[1fr_140px] gap-4">
                <label className="text-[12px] font-medium">{ko ? "일일 예산" : "Daily budget"}<input type="number" min="1" value={form.dailyBudgetCents} onChange={(event) => setForm({ ...form, dailyBudgetCents: Number(event.target.value) || 0 })} className={fieldClass} /></label>
                <label className="text-[12px] font-medium">{ko ? "통화" : "Currency"}<select value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value })} className={fieldClass}><option value="KRW">KRW</option><option value="USD">USD</option><option value="JPY">JPY</option></select></label>
              </div>
              <p className="mt-4 rounded-[7px] bg-[#fff8e1] px-3 py-2 text-[12px] text-[#7a5b00]">{ko ? "예산 관련 AI 제안은 실제 계정 성과가 아닌 추정·참고안으로만 제공됩니다." : "AI budget suggestions are advisory estimates, not actual account performance forecasts."}</p>
            </section>
          )}

          {step === 4 && (
            <section>
              <h2 className="text-[18px] font-semibold">{ko ? "광고 그룹과 키워드를 구성하세요" : "Build your ad group and keywords"}</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-[12px] font-medium">{ko ? "광고 그룹 이름" : "Ad group name"}<input value={form.adGroupName} onChange={(event) => setForm({ ...form, adGroupName: event.target.value })} className={fieldClass} /></label>
                <label className="text-[12px] font-medium">{ko ? "최종 랜딩 URL" : "Final landing URL"}<input type="url" value={form.finalUrl} onChange={(event) => setForm({ ...form, finalUrl: event.target.value, creative: { ...form.creative, finalUrl: event.target.value } })} className={fieldClass} /></label>
              </div>
              <div className="mt-5 rounded-[8px] border border-app-border bg-[#fafbfc] p-4">
                <label className="text-[12px] font-medium">{ko ? "키워드 추가 (쉼표 또는 줄바꿈)" : "Add keywords (comma or line break)"}</label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addKeyword(); } }} placeholder={ko ? "예: 검색 광고 도구, PPC 분석" : "e.g. search ad tools, PPC analysis"} className="h-10 flex-1 rounded-[7px] border border-app-border bg-white px-3 text-[13px] outline-none focus:border-app-blue" />
                  <label className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[7px] border border-app-border bg-white px-3 text-[12px]"><input type="checkbox" checked={keywordNegative} onChange={(event) => setKeywordNegative(event.target.checked)} /> {ko ? "제외 키워드" : "Negative keyword"}</label>
                  <button type="button" onClick={addKeyword} className="h-10 rounded-[7px] bg-[#151a18] px-4 text-[12px] font-semibold text-white">{ko ? "추가" : "Add"}</button>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {form.keywords.length === 0 && <p className="rounded-[7px] border border-dashed border-app-border py-8 text-center text-[12px] text-app-text-secondary">{ko ? "키워드를 직접 추가하거나 광고 리서치 후 가져올 수 있습니다." : "Add keywords manually or import them after advertising research."}</p>}
                {form.keywords.map((item, index) => (
                  <div key={item.id ?? `${item.keyword}-${index}`} className="grid items-center gap-2 rounded-[7px] border border-app-border px-3 py-2 sm:grid-cols-[1fr_110px_100px_auto]">
                    <input value={item.keyword} onChange={(event) => setForm({ ...form, keywords: form.keywords.map((value, itemIndex) => itemIndex === index ? { ...value, keyword: event.target.value } : value) })} className="min-w-0 bg-transparent text-[13px] outline-none" />
                    <select value={item.matchType} onChange={(event) => setForm({ ...form, keywords: form.keywords.map((value, itemIndex) => itemIndex === index ? { ...value, matchType: event.target.value as AdvertisingMatchType } : value) })} className="h-8 rounded border border-app-border bg-white px-2 text-[11px]"><option value="broad">{ko ? "확장" : "Broad"}</option><option value="phrase">{ko ? "구문" : "Phrase"}</option><option value="exact">{ko ? "일치" : "Exact"}</option></select>
                    <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={item.negative} onChange={(event) => setForm({ ...form, keywords: form.keywords.map((value, itemIndex) => itemIndex === index ? { ...value, negative: event.target.checked } : value) })} /> {ko ? "제외" : "Negative"}</label>
                    <button type="button" onClick={() => setForm({ ...form, keywords: form.keywords.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`${item.keyword} 삭제`} className="text-app-text-secondary hover:text-app-red"><Cross2Icon /></button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {step === 5 && (
            <section>
              <h2 className="text-[18px] font-semibold">{ko ? "광고 문구를 작성하세요" : "Write your ad copy"}</h2>
              <p className="mt-1 text-[13px] text-app-text-secondary">{ko ? "Google 규격은 한글·CJK 문자를 2자로 계산합니다. 초과 문구는 저장되지 않습니다." : "Google counts Korean and CJK characters as two units. Over-limit copy is not saved."}</p>
              {form.platform === "google" ? (
                <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_360px]">
                  <div className="space-y-4">
                    {form.creative.headlines.slice(0, 3).map((headline, index) => <label key={index} className="block text-[12px] font-medium">{ko ? "헤드라인" : "Headline"} {index + 1}<input value={headline} onChange={(event) => updateCreative("headlines", form.creative.headlines.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} className={fieldClass} /><span className="mt-1 flex justify-end"><Limit value={headline} max={30} /></span></label>)}
                    {form.creative.descriptions.slice(0, 2).map((description, index) => <label key={index} className="block text-[12px] font-medium">{ko ? "설명" : "Description"} {index + 1}<textarea value={description} onChange={(event) => updateCreative("descriptions", form.creative.descriptions.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} className="mt-1.5 min-h-20 w-full rounded-[7px] border border-app-border p-3 text-[13px] outline-none focus:border-app-blue" /><span className="mt-1 flex justify-end"><Limit value={description} max={90} /></span></label>)}
                    <div className="grid grid-cols-2 gap-3"><label className="text-[12px] font-medium">{ko ? "표시 경로 1" : "Display path 1"}<input value={form.creative.path1 ?? ""} onChange={(event) => updateCreative("path1", event.target.value)} className={fieldClass} /><span className="mt-1 flex justify-end"><Limit value={form.creative.path1 ?? ""} max={15} /></span></label><label className="text-[12px] font-medium">{ko ? "표시 경로 2" : "Display path 2"}<input value={form.creative.path2 ?? ""} onChange={(event) => updateCreative("path2", event.target.value)} className={fieldClass} /><span className="mt-1 flex justify-end"><Limit value={form.creative.path2 ?? ""} max={15} /></span></label></div>
                  </div>
                  <div className="h-fit rounded-[10px] border border-app-border p-5 shadow-sm"><p className="text-[11px] text-[#1769aa]">{ko ? "스폰서" : "Sponsored"} · {form.domain}</p><p className="mt-2 text-[20px] text-[#1a0dab]">{form.creative.headlines.find(Boolean) || (ko ? "광고 헤드라인 미리보기" : "Ad headline preview")}</p><p className="mt-2 text-[13px] leading-5 text-[#4d5156]">{form.creative.descriptions.find(Boolean) || (ko ? "설명을 입력하면 실제 검색 광고와 비슷한 레이아웃으로 확인할 수 있습니다." : "Enter a description to preview a search-ad-style layout.")}</p><p className="mt-4 text-[11px] text-app-text-secondary">{ko ? "레이아웃 미리보기 · 실제 노출 보장 아님" : "Layout preview · Delivery is not guaranteed"}</p></div>
                </div>
              ) : (
                <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
                  <div className="space-y-4"><label className="block text-[12px] font-medium">{ko ? "기본 문구" : "Primary text"}<textarea value={form.creative.primaryText ?? ""} onChange={(event) => updateCreative("primaryText", event.target.value)} className="mt-1.5 min-h-32 w-full rounded-[7px] border border-app-border p-3 text-[13px] outline-none focus:border-app-blue" /></label><label className="block text-[12px] font-medium">{ko ? "헤드라인" : "Headline"}<input value={form.creative.headlines[0] ?? ""} onChange={(event) => updateCreative("headlines", [event.target.value])} className={fieldClass} /></label><label className="block text-[12px] font-medium">CTA<input value={form.creative.callToAction ?? ""} onChange={(event) => updateCreative("callToAction", event.target.value)} className={fieldClass} /></label></div>
                  <div className="h-fit overflow-hidden rounded-[10px] border border-app-border bg-white shadow-sm"><div className="flex aspect-[1.45] items-center justify-center bg-gradient-to-br from-[#e9ddff] to-[#dbeeff] text-[13px] text-app-text-secondary">{ko ? "이미지 생성은 후속 범위입니다" : "Image generation is planned for a later phase"}</div><div className="p-4"><p className="text-[15px] font-semibold">{form.creative.headlines[0] || (ko ? "Meta 광고 헤드라인" : "Meta ad headline")}</p><p className="mt-2 text-[12px] leading-5 text-app-text-secondary">{form.creative.primaryText || (ko ? "기본 문구를 입력해 주세요." : "Enter primary text.")}</p></div></div>
                </div>
              )}
            </section>
          )}

          {step === 6 && (
            <section>
              <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-[18px] font-semibold">{ko ? "캠페인 초안을 검토하세요" : "Review your campaign draft"}</h2><p className="mt-1 text-[13px] text-app-text-secondary">{ko ? "광고 계정으로 게시되지 않습니다. 파일을 내려받아 검토·이관할 수 있습니다." : "Nothing is published to an ad account. Download a file for review or transfer."}</p></div><span className="rounded-full bg-[#e8f7ef] px-3 py-1 text-[11px] font-semibold text-[#237a55]">{campaign?.status === "exported" ? (ko ? "내보냄" : "Exported") : (ko ? "준비됨" : "Ready")}</span></div>
              <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[ [ko ? "플랫폼" : "Platform", form.platform === "google" ? (ko ? "Google 검색" : "Google Search") : "Meta"], [ko ? "목표" : "Goal", form.goal], [ko ? "일일 예산" : "Daily budget", `${form.dailyBudgetCents.toLocaleString()} ${form.currencyCode}`], [ko ? "키워드" : "Keywords", ko ? `${form.keywords.length}개` : `${form.keywords.length}`], [ko ? "지역·언어" : "Region & language", `${form.countryCode} · ${form.languageCode}`], [ko ? "광고 그룹" : "Ad group", form.adGroupName], [ko ? "헤드라인" : "Headlines", ko ? `${cleanedCreative(form).headlines.length}개` : `${cleanedCreative(form).headlines.length}`], [ko ? "폴더" : "Folder", folderId ? (ko ? "연결됨" : "Connected") : (ko ? "미연결" : "Not connected")] ].map(([label, value]) => <div key={label} className="rounded-[8px] bg-[#f7f8f9] p-3"><dt className="text-[11px] text-app-text-secondary">{label}</dt><dd className="mt-1 truncate text-[13px] font-semibold">{value}</dd></div>)}
              </dl>
              <div className="mt-5 rounded-[9px] border border-[#d8c3f2] bg-[#faf6ff] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[13px] font-semibold">{ko ? "광고 AI 에이전트 검토" : "Ads AI Agent review"}</p><p className="mt-1 text-[12px] text-app-text-secondary">{ko ? "ChatMock으로 인증된 ChatGPT 계정이 사이트·키워드·캠페인 설정을 근거로 적용 전 제안을 만듭니다. API 키는 필요하지 않습니다." : "Your ChatGPT account authenticated through ChatMock creates review-before-apply suggestions. No API key is required."}</p></div><div className="flex gap-2"><button type="button" disabled={generating || !campaign} onClick={() => void generate()} className="h-9 rounded-[7px] bg-[#8a4dcc] px-4 text-[12px] font-semibold text-white disabled:opacity-50">{generating ? (ko ? "생성 중…" : "Generating…") : (ko ? "AI 제안 생성" : "Generate AI suggestions")}</button>{campaign && <Link href={`/advertising/ads-ai-agent/?campaign=${campaign.id}${folderId ? `&fid=${encodeURIComponent(folderId)}` : ""}`} className="inline-flex h-9 items-center rounded-[7px] border border-[#8a4dcc] px-4 text-[12px] font-semibold text-[#6e35aa]">{ko ? "제안 검토" : "Review suggestions"}</Link>}</div></div>{campaign?.recommendations.length ? <p className="mt-3 text-[12px] text-[#6e35aa]">{ko ? `적용 전 제안 ${campaign.recommendations.filter((item) => item.status === "pending").length}개가 준비되었습니다.` : `${campaign.recommendations.filter((item) => item.status === "pending").length} suggestions are ready for review.`}</p> : null}</div>
              {campaign && <div className="mt-5 flex flex-wrap gap-2"><a href={`/api/advertising/campaigns/${campaign.id}/export/?format=csv`} className="inline-flex h-10 items-center rounded-[7px] bg-[#151a18] px-5 text-[12px] font-semibold text-white">{ko ? "CSV 내보내기" : "Export CSV"}</a><a href={`/api/advertising/campaigns/${campaign.id}/export/?format=json`} className="inline-flex h-10 items-center rounded-[7px] border border-app-border bg-white px-5 text-[12px] font-semibold">{ko ? "JSON 내보내기" : "Export JSON"}</a><Link href={`/analytics/adwords/positions/?domain=${encodeURIComponent(form.domain)}${folderId ? `&fid=${encodeURIComponent(folderId)}` : ""}`} className="inline-flex h-10 items-center rounded-[7px] border border-app-border bg-white px-5 text-[12px] font-semibold">{ko ? "광고 리서치 열기" : "Open Advertising Research"}</Link></div>}
            </section>
          )}
        </main>

        <footer className="mt-4 flex items-center justify-between gap-3">
          <button type="button" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(0, current - 1))} className="inline-flex h-10 items-center gap-2 rounded-[7px] border border-app-border bg-white px-4 text-[12px] font-semibold disabled:opacity-40"><ArrowLeftIcon /> {ko ? "이전" : "Back"}</button>
          {step < steps.length - 1 && <button type="button" disabled={saving} onClick={() => void next()} className="inline-flex h-10 items-center gap-2 rounded-[7px] bg-app-blue px-5 text-[12px] font-semibold text-white disabled:opacity-50">{saving ? (ko ? "저장 중…" : "Saving…") : (ko ? "저장하고 다음" : "Save and continue")}<ArrowRightIcon /></button>}
        </footer>
      </div>
    </div>
  );
}
