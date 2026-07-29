"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRightIcon,
  CheckIcon,
  Cross2Icon,
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import { AppFooter } from "@/components/crud/AppFooter";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

const primaryButton =
  "inline-flex h-[42px] items-center justify-center gap-2 rounded-[7px] bg-[#a75cf1] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#8d43dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

const darkButton =
  "inline-flex h-[40px] items-center justify-center gap-2 rounded-[6px] bg-[#151917] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#2a2f2c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#151917]";

const campaignGoals = [
  { value: "sales", ko: "온라인 판매 증대", en: "Increase online sales" },
  { value: "leads", ko: "잠재고객 확보", en: "Generate leads" },
  { value: "traffic", ko: "웹사이트 방문 유도", en: "Drive website traffic" },
] as const;

function normalizeWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!url.hostname.includes(".") || /\s/.test(url.hostname)) return null;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function HeroArtwork() {
  return (
    <div className="relative mx-auto h-[300px] w-full max-w-[430px]" aria-hidden="true">
      <div className="absolute left-[7%] top-[34px] h-[218px] w-[205px] rotate-[-2deg] overflow-hidden rounded-[15px] border border-white/25 bg-[#efb546] shadow-[0_22px_50px_rgba(13,16,51,0.34)]">
        <Image
          src="/images/advertising/ai-creative-room.webp"
          alt=""
          fill
          priority
          sizes="220px"
          className="object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-4 pb-4 pt-10 text-white">
          <p className="text-[10px] font-semibold">Modern living</p>
          <div className="mt-2 flex gap-2 text-[9px]">
            <span>♡</span><span>○</span><span>△</span>
          </div>
        </div>
      </div>

      <div className="absolute left-[2%] top-[8px] z-10 flex w-[184px] items-center gap-2 rounded-[9px] bg-white px-3 py-2 shadow-[0_12px_28px_rgba(13,16,51,0.22)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffb64b] text-[15px]">◆</span>
        <span>
          <span className="block text-[10px] font-semibold text-[#272a35]">Lumos Living</span>
          <span className="block text-[8px] text-[#7a7d88]">Lifestyle · Sponsored</span>
        </span>
      </div>

      <div className="absolute right-[2%] top-[42px] z-20 w-[210px] rounded-[10px] bg-white p-3 shadow-[0_14px_32px_rgba(13,16,51,0.25)]">
        <p className="text-[9px] font-medium text-[#535663]">Placement per platform</p>
        <div className="mt-2 flex items-end justify-around gap-3 border-b border-[#ececf0] pb-2">
          {[55, 31, 70].map((height, index) => (
            <div key={height} className="flex h-[72px] items-end gap-[3px]">
              <span className="w-[10px] bg-[#54bff5]" style={{ height }} />
              <span className="w-[10px] bg-[#ffc33f]" style={{ height: Math.max(22, height - 13) }} />
              <span className="sr-only">{["Instagram", "Facebook", "Google"][index]}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 text-center text-[7px] text-[#7d7f89]">
          <span>Instagram</span><span>Facebook</span><span>Google</span>
        </div>
      </div>

      <div className="absolute bottom-[6px] right-[52px] z-30 w-[190px] rounded-[10px] bg-white p-3 shadow-[0_14px_32px_rgba(13,16,51,0.25)]">
        <p className="text-[9px] font-medium text-[#535663]">Distribution by device</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="relative h-[68px] w-[104px] overflow-hidden">
            <div className="absolute left-0 top-0 h-[104px] w-[104px] rounded-full bg-[conic-gradient(#3fc7ea_0_45%,#53d6aa_45%_67%,#ffc43d_67%_100%)]" />
            <div className="absolute left-[22px] top-[22px] h-[60px] w-[60px] rounded-full bg-white" />
          </div>
          <div className="space-y-1 text-[8px] text-[#6b6e79]">
            <p><span className="mr-1 inline-block h-2 w-2 bg-[#3fc7ea]" />Desktop</p>
            <p><span className="mr-1 inline-block h-2 w-2 bg-[#ffc43d]" />Tablet</p>
            <p><span className="mr-1 inline-block h-2 w-2 bg-[#53d6aa]" />Mobile</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscoveryArtwork() {
  return (
    <div className="relative mx-auto mt-8 h-[130px] max-w-[590px] overflow-hidden" aria-hidden="true">
      <div className="absolute left-[4%] top-[28px] h-[104px] w-[88%] rotate-[3deg] rounded-[18px] bg-gradient-to-r from-[#b881f4] to-[#ceb0fa] opacity-55" />
      <div className="absolute left-[12%] top-[12px] h-[116px] w-[76%] rounded-[18px] bg-gradient-to-b from-[#a55ee9] to-[#c793fa] p-4 text-left text-white shadow-[0_20px_38px_rgba(121,63,180,0.24)]">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25">◇</span>
          <span><span className="block text-[10px] font-semibold">yourstore</span><span className="block text-[8px] text-white/75">Sponsored</span></span>
        </div>
        <div className="mt-4 h-[7px] w-4/5 rounded-full bg-white/55" />
        <div className="mt-2 h-[7px] w-3/5 rounded-full bg-white/35" />
        <div className="mt-2 h-[7px] w-2/5 rounded-full bg-white/30" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#faf1ff] to-transparent" />
    </div>
  );
}

function CreativePreview() {
  return (
    <div className="relative overflow-hidden rounded-[12px] border border-white/70 bg-white shadow-[0_12px_30px_rgba(38,39,58,0.12)]">
      <Image
        src="/images/advertising/ai-creative-room.webp"
        alt="AI가 만든 모던 리빙 광고 소재 예시"
        width={960}
        height={640}
        className="aspect-[4/3] w-full object-cover"
      />
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/55 via-transparent to-transparent p-5 text-white">
        <span className="text-[25px] font-semibold leading-[29px]">Modern Living<br />Inspiration</span>
        <span className="mt-3 w-fit rounded-[5px] bg-white/90 px-3 py-1.5 text-[10px] font-semibold text-[#36373d]">Shop now</span>
      </div>
    </div>
  );
}

function CampaignPreview({ ko, onStart }: { ko: boolean; onStart: () => void }) {
  const [channel, setChannel] = useState<"google" | "meta">("google");
  const [budget, setBudget] = useState(60);

  return (
    <div className="rounded-[12px] border border-[#e1e2e7] bg-white p-4 shadow-[0_12px_30px_rgba(38,39,58,0.10)]">
      <div className="flex items-center gap-2 text-[10px] font-medium text-[#777a86]">
        <button
          type="button"
          onClick={() => setChannel("google")}
          className={cn("flex items-center gap-1", channel === "google" && "font-semibold text-[#24262d]")}
        >
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", channel === "google" ? "bg-[#39b980] text-white" : "bg-[#d4d6dc]")}>1</span>
          Google
        </button>
        <span className="h-px flex-1 bg-[#dedfe4]" />
        <button
          type="button"
          onClick={() => setChannel("meta")}
          className={cn("flex items-center gap-1", channel === "meta" && "font-semibold text-[#24262d]")}
        >
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", channel === "meta" ? "bg-[#39b980] text-white" : "bg-[#d4d6dc]")}>2</span>
          Facebook &amp; Instagram
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-[7px] border border-[#ececf0] p-3">
            <p className="text-[10px] font-semibold text-[#393b44]">Keywords</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["interior design", "home renovation", "modern interiors", "custom furniture"].map((item) => (
                <span key={item} className="rounded-[4px] bg-[#dff7ef] px-2 py-1 text-[8px] text-[#26735d]">{item}</span>
              ))}
            </div>
          </div>
          <div className="rounded-[7px] border border-[#ececf0] p-3">
            <p className="text-[10px] font-semibold text-[#393b44]">Sitelinks</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["Interior Design", "Portfolio", "Contact"].map((item) => (
                <span key={item} className="rounded-[4px] bg-[#edf0ff] px-2 py-1 text-[8px] text-[#525fb5]">{item}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-[7px] border border-[#ececf0] p-3">
          <p className="text-[10px] font-semibold text-[#393b44]">
            {channel === "google" ? "Modern Interior Design" : "Home inspiration that converts"}
          </p>
          <p className="mt-1 text-[8px] leading-[13px] text-[#777a84]">
            Design solutions tailored to your space. Explore ideas, materials and custom furniture.
          </p>
          <span className="mt-2 text-[8px] text-[#3d8a67]">● Call business</span>
          <div className="mt-auto pt-4">
            <p className="text-[9px] font-medium text-[#535661]">Daily budget</p>
            <div className="mt-1.5 flex h-8 items-center justify-between rounded-[6px] bg-[#f5f5f7] px-2 text-[10px] font-semibold">
              <span>${budget}</span>
              <span className="flex gap-1">
                <button type="button" aria-label={ko ? "예산 줄이기" : "Decrease budget"} onClick={() => setBudget((value) => Math.max(10, value - 10))} className="flex h-5 w-5 items-center justify-center rounded bg-white hover:bg-[#e8e8ec]"><MinusIcon /></button>
                <button type="button" aria-label={ko ? "예산 늘리기" : "Increase budget"} onClick={() => setBudget((value) => Math.min(500, value + 10))} className="flex h-5 w-5 items-center justify-center rounded bg-white hover:bg-[#e8e8ec]"><PlusIcon /></button>
              </span>
            </div>
          </div>
        </div>
      </div>
      <button type="button" onClick={onStart} className="mt-3 h-[36px] w-full rounded-[7px] bg-[#171a18] text-[11px] font-semibold text-white hover:bg-[#303531]">
        {ko ? "계속" : "Continue"}
      </button>
    </div>
  );
}

function OptimizationPreview({ ko }: { ko: boolean }) {
  const [applied, setApplied] = useState(false);

  return (
    <div className="rounded-[12px] border border-[#e1e2e7] bg-white p-4 shadow-[0_12px_30px_rgba(38,39,58,0.10)]">
      <div className="flex items-start justify-between border-b border-[#ececf0] pb-3">
        <div className="flex gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-[#ddd9ff] text-[#6259d8]">⌕</span>
          <span><span className="block text-[11px] font-semibold text-[#32343d]">Update keywords</span><span className="block text-[8px] text-[#7c7e88]">Change keywords to boost performance</span></span>
        </div>
        <span className="text-[#777984]">×</span>
      </div>

      {applied ? (
        <div className="flex min-h-[146px] flex-col items-center justify-center text-center" aria-live="polite">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d9f6ed] text-[#17785f]"><CheckIcon /></span>
          <p className="mt-3 text-[12px] font-semibold text-[#30323a]">{ko ? "키워드 변경사항을 적용했습니다" : "Keyword changes applied"}</p>
          <button type="button" onClick={() => setApplied(false)} className="mt-2 text-[9px] font-medium text-[#635dc7] hover:underline">{ko ? "실행 취소" : "Undo"}</button>
        </div>
      ) : (
        <>
          <p className="mt-3 text-[9px] font-semibold text-[#555761]">To be added:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["tire service", "roadside help", "mobile repair", "certified technicians", "tire change"].map((item) => (
              <span key={item} className="rounded-[4px] bg-[#c8f5e9] px-2 py-1 text-[8px] text-[#26735d]">{item} ×</span>
            ))}
          </div>
          <p className="mt-3 text-[9px] font-semibold text-[#555761]">To be removed:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["car wash", "auto detailing"].map((item) => (
              <span key={item} className="rounded-[4px] bg-[#ececef] px-2 py-1 text-[8px] text-[#777984]">{item} ×</span>
            ))}
          </div>
          <button type="button" onClick={() => setApplied(true)} className="mt-5 h-[36px] w-full rounded-[7px] bg-[#777b78] text-[11px] font-semibold text-white hover:bg-[#606461]">
            {ko ? "지금 적용" : "Apply now"}
          </button>
        </>
      )}
    </div>
  );
}

function FeatureSection({
  tone,
  eyebrow,
  title,
  bullets,
  cta,
  onStart,
  media,
  reversed,
}: {
  tone: "lavender" | "mint" | "yellow";
  eyebrow: string;
  title: string;
  bullets: string[];
  cta: string;
  onStart: () => void;
  media: ReactNode;
  reversed?: boolean;
}) {
  const toneClass = {
    lavender: "bg-[#edf1ff]",
    mint: "bg-[#e2f8f3]",
    yellow: "bg-[#fbf8df]",
  }[tone];

  return (
    <section className={cn("grid overflow-hidden rounded-[14px] lg:grid-cols-2", toneClass)}>
      <div className={cn("flex flex-col justify-center p-7 lg:p-10", reversed ? "lg:order-2" : "lg:order-1")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8f49ca]">{eyebrow}</p>
        <h3 className="mt-3 text-[24px] font-semibold leading-[31px] text-[#181a20]">{title}</h3>
        <ul className="mt-4 space-y-2">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2 text-[13px] leading-[20px] text-[#34363c]">
              <span className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-[#31343b]" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onStart} className={cn(darkButton, "mt-6 w-fit")}>
          {cta}<ArrowRightIcon />
        </button>
      </div>
      <div className={cn("flex items-center p-6 lg:p-8", reversed ? "lg:order-1" : "lg:order-2")}>
        <div className="w-full">{media}</div>
      </div>
    </section>
  );
}

function SetupDialog({
  open,
  onOpenChange,
  domain,
  ko,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  ko: boolean;
}) {
  const [step, setStep] = useState(1);
  const [channel, setChannel] = useState<"Google" | "Meta">("Google");
  const [goal, setGoal] = useState<(typeof campaignGoals)[number]["value"]>("sales");
  const [budget, setBudget] = useState(60);
  const [ready, setReady] = useState(false);

  const resetAndClose = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      window.setTimeout(() => {
        setStep(1);
        setReady(false);
      }, 200);
    }
  };

  const selectedGoal = campaignGoals.find((item) => item.value === goal) ?? campaignGoals[0];

  return (
    <Dialog.Root open={open} onOpenChange={resetAndClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-[#11152f]/55 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[90] w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-[14px] bg-white p-6 text-[#1c1e24] shadow-[0_30px_80px_rgba(16,19,42,0.3)] focus:outline-none sm:p-8">
          <Dialog.Close asChild>
            <button type="button" aria-label={ko ? "닫기" : "Close"} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#6c6f78] hover:bg-[#f1f2f4]">
              <Cross2Icon />
            </button>
          </Dialog.Close>

          {ready ? (
            <div className="py-4 text-center" aria-live="polite">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#d9f7ed] text-[#0a8668]"><CheckIcon width={26} height={26} /></span>
              <Dialog.Title className="mt-5 text-[24px] font-semibold">{ko ? "캠페인 초안이 준비되었습니다" : "Your campaign draft is ready"}</Dialog.Title>
              <Dialog.Description className="mx-auto mt-3 max-w-[410px] text-[13px] leading-[21px] text-[#656873]">
                {ko ? `${domain}의 ${channel} 광고 초안을 만들었습니다. 광고 AI 에이전트에서 문구와 키워드를 더 세밀하게 조정할 수 있습니다.` : `We created a ${channel} campaign draft for ${domain}. Continue in Ads AI Agent to refine copy and keywords.`}
              </Dialog.Description>
              <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
                <Dialog.Close asChild>
                  <button type="button" className="h-[42px] rounded-[7px] border border-[#dadbe0] px-5 text-[13px] font-semibold hover:bg-[#f5f5f7]">{ko ? "페이지로 돌아가기" : "Back to page"}</button>
                </Dialog.Close>
                <Link href="/advertising/ads-ai-agent" className={cn(primaryButton, "focus-visible:outline-[#7f42cf]")}>{ko ? "광고 AI 에이전트로 이동" : "Open Ads AI Agent"}<ArrowRightIcon /></Link>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8f49ca]">{ko ? `단계 ${step}/3` : `Step ${step} of 3`}</p>
              <Dialog.Title className="mt-2 pr-8 text-[24px] font-semibold">{ko ? "광고 캠페인 설정" : "Set up your ad campaign"}</Dialog.Title>
              <Dialog.Description className="mt-2 text-[13px] leading-[20px] text-[#686b75]">
                {ko ? `${domain}에 맞는 캠페인 초안을 세 단계로 준비합니다.` : `Prepare a campaign draft for ${domain} in three steps.`}
              </Dialog.Description>

              <div className="mt-6 flex gap-2" aria-hidden="true">
                {[1, 2, 3].map((item) => <span key={item} className={cn("h-1.5 flex-1 rounded-full", item <= step ? "bg-[#9b51e8]" : "bg-[#ececf0]")} />)}
              </div>

              {step === 1 && (
                <fieldset className="mt-7">
                  <legend className="text-[14px] font-semibold">{ko ? "광고 플랫폼을 선택하세요" : "Choose an ad platform"}</legend>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {(["Google", "Meta"] as const).map((item) => (
                      <button key={item} type="button" onClick={() => setChannel(item)} aria-pressed={channel === item} className={cn("rounded-[10px] border p-4 text-left transition-colors", channel === item ? "border-[#8c4cdc] bg-[#faf3ff]" : "border-[#dedfe4] hover:bg-[#f7f7f8]")}>
                        <span className="text-[15px] font-semibold">{item}</span>
                        <span className="mt-1 block text-[11px] text-[#737680]">{item === "Google" ? (ko ? "검색·디스플레이 광고" : "Search & display ads") : (ko ? "Facebook·Instagram 광고" : "Facebook & Instagram ads")}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {step === 2 && (
                <div className="mt-7 space-y-5">
                  <fieldset>
                    <legend className="text-[14px] font-semibold">{ko ? "캠페인 목표" : "Campaign goal"}</legend>
                    <div className="mt-3 grid gap-2">
                      {campaignGoals.map((item) => (
                        <label key={item.value} className={cn("flex cursor-pointer items-center gap-3 rounded-[8px] border px-4 py-3 text-[13px]", goal === item.value ? "border-[#8c4cdc] bg-[#faf3ff]" : "border-[#e0e1e5]")}>
                          <input type="radio" name="campaign-goal" value={item.value} checked={goal === item.value} onChange={() => setGoal(item.value)} className="accent-[#8c4cdc]" />
                          {ko ? item.ko : item.en}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block">
                    <span className="text-[14px] font-semibold">{ko ? "일일 예산" : "Daily budget"}</span>
                    <span className="mt-3 flex h-[44px] items-center justify-between rounded-[8px] border border-[#dedfe4] px-3">
                      <span className="text-[14px] font-semibold">${budget}</span>
                      <span className="flex gap-2">
                        <button type="button" aria-label={ko ? "예산 줄이기" : "Decrease budget"} onClick={() => setBudget((value) => Math.max(10, value - 10))} className="flex h-7 w-7 items-center justify-center rounded bg-[#f2f2f4] hover:bg-[#e7e7eb]"><MinusIcon /></button>
                        <button type="button" aria-label={ko ? "예산 늘리기" : "Increase budget"} onClick={() => setBudget((value) => Math.min(500, value + 10))} className="flex h-7 w-7 items-center justify-center rounded bg-[#f2f2f4] hover:bg-[#e7e7eb]"><PlusIcon /></button>
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {step === 3 && (
                <div className="mt-7 rounded-[10px] bg-[#f6f6f8] p-5">
                  <h3 className="text-[14px] font-semibold">{ko ? "설정 검토" : "Review settings"}</h3>
                  <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-3 text-[13px]">
                    <dt className="text-[#777984]">{ko ? "웹사이트" : "Website"}</dt><dd className="font-medium">{domain}</dd>
                    <dt className="text-[#777984]">{ko ? "플랫폼" : "Platform"}</dt><dd className="font-medium">{channel}</dd>
                    <dt className="text-[#777984]">{ko ? "목표" : "Goal"}</dt><dd className="font-medium">{ko ? selectedGoal.ko : selectedGoal.en}</dd>
                    <dt className="text-[#777984]">{ko ? "일일 예산" : "Daily budget"}</dt><dd className="font-medium">${budget}</dd>
                  </dl>
                  <p className="mt-4 border-t border-[#dfdfe4] pt-4 text-[11px] leading-[18px] text-[#70727b]">{ko ? "초안 생성 후에도 광고 문구, 키워드와 예산을 검토하고 변경할 수 있습니다." : "You can review and change copy, keywords, and budget after the draft is generated."}</p>
                </div>
              )}

              <div className="mt-7 flex justify-between gap-3">
                <button type="button" onClick={() => step === 1 ? resetAndClose(false) : setStep((value) => value - 1)} className="h-[42px] rounded-[7px] border border-[#dadbe0] px-5 text-[13px] font-semibold hover:bg-[#f5f5f7]">{step === 1 ? (ko ? "취소" : "Cancel") : (ko ? "이전" : "Back")}</button>
                <button type="button" onClick={() => step < 3 ? setStep((value) => value + 1) : setReady(true)} className={cn(primaryButton, "focus-visible:outline-[#7f42cf]")}>{step < 3 ? (ko ? "계속" : "Continue") : (ko ? "캠페인 초안 만들기" : "Create campaign draft")}<ArrowRightIcon /></button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AdsLaunchAssistant() {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const inputRef = useRef<HTMLInputElement>(null);
  const analyzerRef = useRef<HTMLElement>(null);
  const [domain, setDomain] = useState("");
  const [validatedDomain, setValidatedDomain] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const focusAnalyzer = () => {
    analyzerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => inputRef.current?.focus(), 450);
  };

  const submitDomain = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeWebsite(domain);
    if (!normalized) {
      setDomainError(ko ? "올바른 도메인 또는 URL을 입력해 주세요." : "Enter a valid domain or URL.");
      inputRef.current?.focus();
      return;
    }

    setDomain(normalized);
    setValidatedDomain(normalized);
    setDomainError(null);
    setDialogOpen(true);
  };

  const examples = ["semrush.com", "youtube.com", "microsoft.com", "samsung.com", "nba.com"];

  return (
    <div className="overflow-hidden bg-[#f4f6f5] text-[#17191e]">
      <section className="relative overflow-hidden bg-[#2d326b]">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_70%_20%,#6557b3_0,transparent_34%),radial-gradient(circle_at_20%_80%,#272a59_0,transparent_38%)]" aria-hidden="true" />
        <div className="relative mx-auto grid min-h-[520px] max-w-[1040px] items-center gap-8 px-6 pb-24 pt-14 text-white lg:grid-cols-[1.05fr_.95fr] lg:px-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-[#ddd7ff]">
              <span className="text-[#6ec9ff]">G</span>{ko ? "2025년 구글 프리미어 파트너" : "2025 Google Premier Partner"}
            </p>
            <h1 className="mt-5 max-w-[540px] text-[36px] font-semibold leading-[46px] tracking-[-0.02em] md:text-[43px] md:leading-[53px]">
              {ko ? <>AI를 활용하여 캠페인 성과를<br className="hidden sm:block" /> 향상시키세요.</> : <>Improve campaign performance<br className="hidden sm:block" /> with AI.</>}
            </h1>
            <p className="mt-4 max-w-[500px] text-[15px] leading-[23px] text-white/78">
              {ko ? "Google 및 Meta에서 캠페인을 생성, 실행 및 최적화하세요." : "Create, launch, and optimize campaigns across Google and Meta."}
            </p>
            <button type="button" onClick={focusAnalyzer} className={cn(primaryButton, "mt-7")}>
              {ko ? "지금 바로 시작해 보세요" : "Get started now"}<RocketIcon />
            </button>
          </div>
          <HeroArtwork />
        </div>
      </section>

      <main className="mx-auto max-w-[1040px] px-5 pb-24 sm:px-8">
        <section ref={analyzerRef} className="relative z-10 -mt-16 scroll-mt-20 rounded-[16px] bg-[#faf1ff] px-6 pb-0 pt-10 text-center shadow-[0_-2px_0_rgba(255,255,255,0.55)] md:px-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#a050c6]">{ko ? "한번 시도해 보세요" : "Give it a try"}</p>
          <h2 className="mt-3 text-[27px] font-semibold leading-[35px]">{ko ? "광고 실행 도우미의 작동 방식을 확인하세요" : "See how Ads Launch Assistant works"}</h2>
          <p className="mx-auto mt-3 max-w-[620px] text-[14px] leading-[22px] text-[#5d606a]">{ko ? "웹사이트 URL을 입력하여 광고가 어떻게 표시될지 확인해 보세요." : "Enter your website URL to preview how your ads could appear."}</p>

          <form onSubmit={submitDomain} noValidate className="mx-auto mt-6 max-w-[680px]">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="ads-launch-domain">{ko ? "도메인 또는 URL" : "Domain or URL"}</label>
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8c95]" />
                <input
                  ref={inputRef}
                  id="ads-launch-domain"
                  value={domain}
                  onChange={(event) => {
                    setDomain(event.target.value);
                    if (domainError) setDomainError(null);
                  }}
                  placeholder={ko ? "도메인 또는 URL을 입력하세요." : "Enter a domain or URL"}
                  aria-invalid={Boolean(domainError)}
                  aria-describedby={domainError ? "ads-launch-domain-error" : undefined}
                  className="h-[44px] w-full rounded-[6px] border border-[#d7d8de] bg-white pl-10 pr-3 text-[14px] outline-none transition-colors placeholder:text-[#9799a2] focus:border-[#7355d9]"
                />
              </div>
              <button type="submit" className={cn(darkButton, "h-[44px] sm:min-w-[190px]")}>{ko ? "둘러볼까요" : "Show me around"}<ArrowRightIcon /></button>
            </div>
            {domainError && <p id="ads-launch-domain-error" role="alert" className="mt-2 text-left text-[12px] text-[#c7133c]">{domainError}</p>}
          </form>

          <div className="mx-auto mt-4 flex max-w-[680px] flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-[#747680]">
            <span>{ko ? "예시:" : "Examples:"}</span>
            {examples.map((example) => (
              <button key={example} type="button" onClick={() => { setDomain(example); setDomainError(null); inputRef.current?.focus(); }} className="font-medium text-[#235fe2] hover:underline">{example}</button>
            ))}
          </div>
          <DiscoveryArtwork />
        </section>

        <section className="py-16 text-center">
          <h2 className="mx-auto max-w-[820px] text-[28px] font-semibold leading-[37px] md:text-[32px] md:leading-[42px]">
            {ko ? <>AI 기반 광고를 제작하고, 몇 번의 클릭만으로 광고를 게재하고,<br className="hidden md:block" /> 성과를 추적하세요. 이 모든 기능을 하나의 도구에서 이용할 수 있습니다.</> : <>Create AI-powered ads, launch them in a few clicks, and track performance—all in one tool.</>}
          </h2>
        </section>

        <div className="space-y-9">
          <FeatureSection
            tone="lavender"
            eyebrow={ko ? "AI로 만들어보세요" : "Create with AI"}
            title={ko ? "빠르고 간편한 광고 제작" : "Create ads quickly and easily"}
            bullets={ko ? ["브랜드 이미지에 맞춰 고품질 이미지를 생성하세요.", "50가지 이상의 디지털 애플리케이션용 광고를 준비하세요.", "광고 형식을 손쉽게 바꾸고 다양한 레이아웃을 검토하세요."] : ["Generate quality images that match your brand.", "Prepare ads for more than 50 digital placements.", "Resize and review layouts with ease."]}
            cta={ko ? "지금 바로 광고를 만들어보세요" : "Create an ad now"}
            onStart={focusAnalyzer}
            media={<CreativePreview />}
          />
          <FeatureSection
            tone="mint"
            eyebrow={ko ? "시작하다" : "Launch"}
            title={ko ? "간편하게 광고를 운영하세요" : "Launch ads with ease"}
            bullets={ko ? ["AI가 생성한 광고 문구, 이미지, 템플릿 및 동영상을 활용하세요.", "Google과 Meta를 통해 캠페인을 시작하세요.", "플랫폼을 수정하고 목표와 예산을 선택해 캠페인을 설정하세요."] : ["Use AI-generated copy, images, templates, and video.", "Launch campaigns through Google and Meta.", "Choose your platform, goal, and budget."]}
            cta={ko ? "광고 시작" : "Start advertising"}
            onStart={focusAnalyzer}
            media={<CampaignPreview ko={ko} onStart={focusAnalyzer} />}
            reversed
          />
          <FeatureSection
            tone="yellow"
            eyebrow={ko ? "AI로 최적화" : "Optimize with AI"}
            title={ko ? "클릭 한 번으로 광고 실적 최적화" : "Optimize ad performance in one click"}
            bullets={ko ? ["맞춤 추천을 받아 클릭 한 번으로 캠페인을 수정하세요.", "새 키워드와 성과가 낮은 키워드 제안을 검토하세요.", "캠페인 성과에 대한 통찰 보고서를 확인하세요."] : ["Apply tailored recommendations in one click.", "Review new and underperforming keyword suggestions.", "Track insights about campaign performance."]}
            cta={ko ? "광고 시작" : "Start advertising"}
            onStart={focusAnalyzer}
            media={<OptimizationPreview ko={ko} />}
          />
        </div>

        <section className="mt-16 rounded-[14px] bg-[#cfdcff] px-6 py-12 text-center md:px-16">
          <span className="text-[36px] leading-none text-[#3763c8]">“</span>
          <blockquote className="mx-auto mt-4 max-w-[790px] text-[19px] font-semibold leading-[29px] text-[#20243b]">
            {ko ? "Ads Launch Assistant를 사용하니 다른 어떤 플랫폼보다 저희 소규모 사업체의 광고 운영이 훨씬 쉬워졌습니다. 더 나은 결과를 얻었고, AI 기반 제안 덕분에 광고 문구 작성 시간도 단축되었습니다." : "Ads Launch Assistant made advertising our small business easier than any other platform. We achieved better results and saved time writing copy with AI-powered suggestions."}
          </blockquote>
          <Image src="/images/advertising/testimonial-avatar.webp" alt={ko ? "고객 후기 작성자" : "Customer testimonial author"} width={64} height={64} className="mx-auto mt-6 h-16 w-16 rounded-full object-cover" />
          <p className="mt-3 text-[12px] font-semibold text-[#262a40]">{ko ? "김도현" : "Alex Kim"}</p>
          <p className="mt-1 text-[10px] text-[#60657d]">{ko ? "웨이브 밸리 쿠튀르 디렉터" : "Director, Wave Valley Couture"}</p>
        </section>

        <section className="mt-10 rounded-[14px] bg-[#2d326b] px-6 py-12 text-center text-white md:px-16">
          <h2 className="text-[28px] font-semibold leading-[36px]">{ko ? "더욱 스마트한 광고로 적합한 고객에게 도달하세요" : "Reach the right customers with smarter ads"}</h2>
          <p className="mx-auto mt-3 max-w-[700px] text-[14px] leading-[22px] text-white/75">{ko ? "AI 기반 캠페인 도우미를 활용하여 경쟁사를 능가하고 투자 수익률(ROI)을 향상시키세요." : "Use an AI-powered campaign assistant to outperform competitors and improve ROI."}</p>
          <button type="button" onClick={focusAnalyzer} className={cn(primaryButton, "mt-7")}>{ko ? "지금 바로 시도해 보세요" : "Try it now"}<ArrowRightIcon /></button>
        </section>
      </main>

      <AppFooter />
      <SetupDialog open={dialogOpen} onOpenChange={setDialogOpen} domain={validatedDomain} ko={ko} />
    </div>
  );
}
