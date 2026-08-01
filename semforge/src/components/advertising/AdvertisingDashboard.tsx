"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  RocketIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppFooter } from "@/components/crud/AppFooter";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

const trendData = [
  { month: "1월", traffic: 76 },
  { month: "2월", traffic: 51 },
  { month: "3월", traffic: 42 },
  { month: "4월", traffic: 69 },
  { month: "5월", traffic: 88 },
  { month: "6월", traffic: 112 },
];

const TESTIMONIALS = [
  {
    quote:
      "SEMForge는 제 광고 캠페인의 경쟁 환경을 더 잘 이해하는 데 매우 중요한 역할을 했습니다. 이를 통해 우리가 겨냥한 모든 검색 기반 전략을 세우고 예산과 전환을 보다 효율적으로 배분할 수 있었습니다.",
    name: "한나 마르틴",
    role: "KoMarketing 디지털 마케팅 리더",
    quoteEn:
      "SEMForge played a key role in helping us understand the competitive landscape, plan search-led strategies, and allocate budget more efficiently.",
    nameEn: "Hannah Martin",
    roleEn: "Digital Marketing Lead, KoMarketing",
  },
  {
    quote:
      "경쟁사의 메시지와 키워드를 한 화면에서 비교하면서 캠페인 준비 시간이 크게 줄었습니다. 팀 전체가 같은 근거로 더 빠르게 의사결정할 수 있게 됐습니다.",
    name: "소피아 리",
    role: "GrowthLoop 퍼포먼스 마케팅 총괄",
    quoteEn:
      "Comparing competitor messages and keywords in one place shortened campaign preparation and helped the whole team decide from the same evidence.",
    nameEn: "Sophia Lee",
    roleEn: "Head of Performance Marketing, GrowthLoop",
  },
  {
    quote:
      "광고 제작부터 키워드 개선까지 이어지는 흐름이 명확합니다. 작은 팀도 여러 채널을 일관되게 관리할 수 있다는 점이 가장 큰 장점입니다.",
    name: "에밀리 박",
    role: "Northstar 브랜드 디렉터",
    quoteEn:
      "The workflow from ad creation to keyword improvement is clear, making it easier for a small team to manage channels consistently.",
    nameEn: "Emily Park",
    roleEn: "Brand Director, Northstar",
  },
  {
    quote:
      "데이터를 찾고 정리하는 시간이 줄어들어 실험과 최적화에 더 많은 시간을 쓸 수 있습니다. 매주 보고하는 지표도 훨씬 이해하기 쉬워졌습니다.",
    name: "지윤 김",
    role: "Maven Commerce 마케팅 매니저",
    quoteEn:
      "We spend less time finding and organizing data and more time experimenting. Weekly reporting is much easier to understand too.",
    nameEn: "Jiyoon Kim",
    roleEn: "Marketing Manager, Maven Commerce",
  },
] as const;

const FAQS = [
  {
    question: "광고 툴킷은 무엇이며 저에게 어떤 도움이 되나요?",
    answer:
      "경쟁사 리서치, 키워드 발굴, 광고 제작과 캠페인 최적화를 하나의 흐름으로 연결합니다. 필요한 도구만 골라 시작하고 결과에 따라 다음 작업으로 이동할 수 있습니다.",
    questionEn: "What is the Advertising Toolkit and how can it help me?",
    answerEn:
      "It connects competitor research, keyword discovery, ad creation, and campaign optimization in one workflow. Start with the tools you need and move to the next task as results arrive.",
  },
  {
    question: "이 툴킷은 자사의 비즈니스와 어떻게 통합될 수 있을까요?",
    answer:
      "기존 웹사이트와 캠페인 정보를 기준으로 리서치를 시작할 수 있으며, 광고 실행 도우미와 AI 에이전트에서 작업을 이어갈 수 있습니다.",
    questionEn: "How can the toolkit fit into my business?",
    answerEn:
      "Start research from your website and campaign context, then continue the work in Ads Launch Assistant and Ads AI Agent.",
  },
  {
    question: "클릭 한 번으로 무엇을 최적화할 수 있나요?",
    answer:
      "키워드 제안, 제외 키워드, 광고 문구와 예산 배분 같은 반복 작업을 검토하고 적용할 수 있습니다. 실제 변경 전에는 제안 내용을 확인할 수 있습니다.",
    questionEn: "What can I optimize in one click?",
    answerEn:
      "Review and apply keyword, negative keyword, ad copy, and advisory budget suggestions. Every proposed change is shown before it is applied.",
  },
] as const;

const primaryButton =
  "inline-flex h-[42px] items-center justify-center gap-2 rounded-[7px] bg-[#9b51e8] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#8641d5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

const darkButton =
  "inline-flex h-[38px] items-center justify-center gap-2 rounded-[7px] bg-[#151a18] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#303634] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235fe2]";

function DemoFrame({ children, label, ko }: { children: ReactNode; label: string; ko: boolean }) {
  return (
    <div className="rounded-[14px] border border-[#e2e3e8] bg-white p-4 shadow-[0_12px_28px_rgba(26,31,44,0.10)]">
      <div className="mb-3 flex items-center justify-between border-b border-[#ececee] pb-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71717a]">
          {label}
        </span>
        <span className="rounded-full bg-[#e9f7ef] px-2 py-1 text-[10px] font-semibold text-[#08765c]">
          {ko ? "예시 화면" : "Example screen"}
        </span>
      </div>
      {children}
    </div>
  );
}

function AgentPreview({ ko }: { ko: boolean }) {
  return (
    <DemoFrame label={ko ? "광고 AI 에이전트" : "Ads AI Agent"} ko={ko}>
      <div className="space-y-3 text-[12px] leading-[18px]">
        <div className="max-w-[88%] rounded-[10px] bg-[#f1f2f4] p-3 text-[#34363d]">
          {ko ? "최근 캠페인에서 전환 비용이 높아진 이유를 분석해 주세요." : "Review why conversion costs increased in the latest campaign."}
        </div>
        <div className="ml-auto max-w-[92%] rounded-[10px] bg-[#eee7ff] p-3 text-[#30236b]">
          {ko ? "모바일 검색 광고의 입찰가와 전환율이 낮은 키워드 4개가 주요 원인입니다. 예산 재배분안을 준비했어요." : "Four low-performing mobile search keywords are the main driver. An advisory reallocation is ready for review."}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            [ko ? "낭비 비용" : "Wasted spend", "₩574K"],
            [ko ? "개선 후보" : "Candidates", ko ? "4개" : "4"],
            [ko ? "예상 절감" : "Estimated saving", "18%"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[8px] border border-[#e8e9ed] p-2">
              <span className="block text-[10px] text-[#71717a]">{label}</span>
              <strong className="mt-1 block text-[13px] text-[#191b20]">{value}</strong>
            </div>
          ))}
        </div>
      </div>
    </DemoFrame>
  );
}

function TrendPreview({ ko }: { ko: boolean }) {
  return (
    <DemoFrame label={ko ? "유료 검색 트렌드" : "Paid search trend"} ko={ko}>
      <div className="grid grid-cols-3 gap-2">
        {[
          [ko ? "키워드" : "Keywords", "2.2K"],
          [ko ? "트래픽" : "Traffic", "143.6K"],
          [ko ? "트래픽 비용" : "Traffic cost", "$96.2K"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[8px] bg-[#f7f8fa] px-2.5 py-2">
            <span className="block text-[9px] text-[#71717a]">{label}</span>
            <strong className="text-[12px] text-[#202126]">{value}</strong>
          </div>
        ))}
      </div>
      <div className="mt-4 h-[190px]" aria-label={ko ? "월별 유료 검색 트래픽 예시 차트" : "Example monthly paid search traffic chart"}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trendData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#eceef2" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#71717a" }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#71717a" }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e3e8", fontSize: 11 }} />
            <Bar dataKey="traffic" fill="#f5b400" radius={[4, 4, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DemoFrame>
  );
}

function KeywordPreview({ ko }: { ko: boolean }) {
  return (
    <DemoFrame label={ko ? "PPC 키워드 관리자" : "PPC keyword manager"} ko={ko}>
      <div className="overflow-hidden rounded-[9px] border border-[#e3e4e8]">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="bg-[#f6f7f9] text-[#71717a]">
            <tr>
              <th className="px-3 py-2 font-medium">{ko ? "키워드" : "Keyword"}</th>
              <th className="px-3 py-2 font-medium">{ko ? "검색량" : "Volume"}</th>
              <th className="px-3 py-2 font-medium">CPC</th>
            </tr>
          </thead>
          <tbody className="text-[#303239]">
            {[
              [ko ? "광고 자동화" : "ad automation", "12,000", "₩1,420"],
              [ko ? "검색 광고 도구" : "search ad tools", "8,800", "₩1,160"],
              [ko ? "PPC 최적화" : "PPC optimization", "6,300", "₩980"],
              [ko ? "AI 광고 제작" : "AI ad creation", "4,900", "₩1,730"],
            ].map((row) => (
              <tr key={row[0]} className="border-t border-[#ececee]">
                {row.map((cell) => (
                  <td key={cell} className="px-3 py-2.5">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoFrame>
  );
}

function CampaignPreview({ ko }: { ko: boolean }) {
  const [platform, setPlatform] = useState("Google");
  return (
    <DemoFrame label={ko ? "캠페인 빌더" : "Campaign builder"} ko={ko}>
      <div className="flex gap-2" role="tablist" aria-label={ko ? "광고 플랫폼 선택" : "Select advertising platform"}>
        {["Google", "Facebook & Instagram"].map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={platform === item}
            onClick={() => setPlatform(item)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] font-medium",
              platform === item ? "bg-[#25282d] text-white" : "bg-[#f0f1f3] text-[#61636b]"
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-[11px] font-medium text-[#383a41]">
        {ko ? "캠페인 목표" : "Campaign goal"}
        <select className="mt-1.5 h-[36px] w-full rounded-[7px] border border-[#d9dbe1] bg-white px-3 text-[12px]">
          <option>{ko ? "온라인 판매 늘리기" : "Increase online sales"}</option>
          <option>{ko ? "리드 확보하기" : "Generate leads"}</option>
          <option>{ko ? "브랜드 인지도 높이기" : "Build brand awareness"}</option>
        </select>
      </label>
      <div className="mt-4">
        <span className="text-[11px] font-medium text-[#383a41]">{ko ? "추천 키워드" : "Suggested keywords"}</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["interior design", "home renovation", "modern interiors", "custom furniture"].map((keyword) => (
            <span key={keyword} className="rounded-[5px] bg-[#daf7ef] px-2 py-1 text-[10px] text-[#08765c]">
              {keyword}
            </span>
          ))}
        </div>
      </div>
      <Link href="/advertising/ads-launch-assistant" className={cn(darkButton, "mt-5 w-full")}>
        {ko ? "계속" : "Continue"}
        <ArrowRightIcon />
      </Link>
    </DemoFrame>
  );
}

function UpdatePreview({ ko }: { ko: boolean }) {
  const [applied, setApplied] = useState(false);
  return (
    <DemoFrame label={ko ? "키워드 업데이트" : "Keyword update"} ko={ko}>
      <div className="rounded-[9px] bg-[#f5f7ff] p-3">
        <div className="flex items-start gap-2">
          <UpdateIcon className="mt-0.5 h-4 w-4 text-[#625ee8]" />
          <div>
            <p className="text-[12px] font-semibold text-[#2c2e35]">{ko ? "성과 기반 키워드 변경" : "Performance-based keyword changes"}</p>
            <p className="mt-0.5 text-[10px] text-[#71717a]">{ko ? "7개의 변경사항을 검토했습니다." : "Seven changes reviewed."}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {[
          [ko ? "추가" : "Add", "remodeling service", "bg-[#daf7ef] text-[#08765c]"],
          [ko ? "추가" : "Add", "mobile repair", "bg-[#daf7ef] text-[#08765c]"],
          [ko ? "제외" : "Exclude", "outdated listing", "bg-[#f1f2f4] text-[#656872]"],
        ].map(([action, keyword, style]) => (
          <label key={keyword} className="flex items-center gap-2 text-[11px] text-[#36383f]">
            <input type="checkbox" defaultChecked className="h-3.5 w-3.5 accent-[#625ee8]" />
            <span className={cn("rounded-[5px] px-2 py-1", style)}>{action}: {keyword}</span>
          </label>
        ))}
      </div>
      <button type="button" onClick={() => setApplied(true)} className={cn(darkButton, "mt-5 w-full")}>
        {applied ? (ko ? "적용 완료" : "Applied") : (ko ? "변경사항 적용" : "Apply changes")}
        {applied && <CheckIcon />}
      </button>
    </DemoFrame>
  );
}

function FeatureSection({
  eyebrow,
  title,
  description,
  bullets,
  href,
  cta,
  tone,
  media,
  reversed,
}: {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  href: string;
  cta: string;
  tone: "blue" | "yellow" | "mint";
  media: ReactNode;
  reversed?: boolean;
}) {
  const toneClass = {
    blue: "bg-[#eef3ff]",
    yellow: "bg-[#fff9df]",
    mint: "bg-[#e9fbf7]",
  }[tone];

  return (
    <section className={cn("grid overflow-hidden rounded-[14px] lg:min-h-[420px] lg:grid-cols-2", toneClass)}>
      <div className={cn("p-7 lg:p-10", reversed ? "lg:order-2" : "lg:order-1")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#8e47c8]">{eyebrow}</p>
        <h3 className="mt-2 text-[24px] font-semibold leading-[31px] text-[#17191e]">{title}</h3>
        <p className="mt-3 text-[14px] leading-[22px] text-[#555861]">{description}</p>
        <ul className="mt-4 space-y-2">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2 text-[13px] leading-[19px] text-[#34363c]">
              <CheckIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#08765c]" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <Link href={href} className={cn(darkButton, "mt-5")}>
          {cta}
          <ArrowRightIcon />
        </Link>
      </div>
      <div className={cn("flex items-center p-6 lg:p-8", reversed ? "lg:order-1" : "lg:order-2")}>
        <div className="w-full">{media}</div>
      </div>
    </section>
  );
}

export function AdvertisingDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [domain, setDomain] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const folderId = searchParams.get("fid");
  const withFolder = (href: string) =>
    folderId ? `${href}${href.includes("?") ? "&" : "?"}fid=${encodeURIComponent(folderId)}` : href;
  const assistantHref = withFolder("/advertising/ads-launch-assistant");
  const agentHref = withFolder("/advertising/ads-ai-agent");
  const researchHref = withFolder("/analytics/adwords/positions/");

  const submitDomain = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = domain.trim();
    if (!value) {
      setDomainError(ko ? "도메인 또는 URL을 입력해 주세요." : "Enter a domain or URL.");
      return;
    }
    setDomainError(null);
    const query = new URLSearchParams({ domain: value });
    if (folderId) query.set("fid", folderId);
    router.push(`/advertising/ads-launch-assistant/?${query}`);
  };

  const testimonial = TESTIMONIALS[testimonialIndex];

  return (
    <div className="overflow-hidden bg-[#f6f6f7] text-[#17191e]">
      <section className="relative isolate min-h-[430px] overflow-hidden bg-[#24285f]">
        <Image
          src="/images/advertising/hero-keyboard.webp"
          alt="어두운 조명 아래 광고 캠페인을 준비하는 노트북 키보드"
          fill
          priority
          sizes="(min-width: 1024px) calc(100vw - 317px), 100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[#24285f]/80" aria-hidden="true" />
        <div className="relative mx-auto flex min-h-[430px] max-w-[920px] flex-col items-center justify-center px-6 pb-16 pt-12 text-center text-white">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#d7c6ff]">
            {ko ? "SEMForge 광고 툴킷" : "SEMForge Advertising Toolkit"}
          </p>
          <h1 className="mt-4 max-w-[780px] text-[34px] font-semibold leading-[43px] md:text-[42px] md:leading-[52px]">
            {ko ? "보다 효과적인 광고 캠페인을 실행하세요" : "Run more effective advertising campaigns"}
          </h1>
          <p className="mt-4 max-w-[680px] text-[15px] leading-[23px] text-white/80">
            {ko
              ? "경쟁사 분석, 캠페인 기획, Google·Meta 광고 실행과 최적화에 필요한 모든 기능을 하나의 툴킷으로 만나보세요."
              : "Research competitors, plan campaigns, and launch and optimize Google and Meta ads in one toolkit."}
          </p>
          <Link href={assistantHref} className={cn(primaryButton, "mt-7")}>
            {ko ? "지금 바로 시작해 보세요" : "Get started now"}
            <RocketIcon />
          </Link>
        </div>
      </section>

      <main className="mx-auto max-w-[1040px] px-5 pb-32 sm:px-8">
        <section className="relative z-10 -mt-16 rounded-t-[18px] bg-[#faf1ff] px-6 pb-10 pt-10 text-center shadow-[0_-2px_0_rgba(255,255,255,0.65)] md:px-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a058c8]">
            {ko ? "광고 시작을 위한 한 곳" : "One place to start advertising"}
          </p>
          <h2 className="mt-2 text-[26px] font-semibold leading-[34px]">
            {ko ? "광고 툴킷의 실제 활용 사례를 확인해 보세요." : "See how the advertising toolkit works."}
          </h2>
          <p className="mx-auto mt-3 max-w-[680px] text-[14px] leading-[22px] text-[#5a5c65]">
            {ko
              ? "웹사이트 URL을 입력하면 경쟁 환경을 살펴보고 가장 적합한 광고 워크플로로 이동할 수 있습니다."
              : "Enter a website URL to explore the competitive landscape and choose the right advertising workflow."}
          </p>
          <form onSubmit={submitDomain} className="mx-auto mt-6 max-w-[700px]" noValidate>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="advertising-domain">{ko ? "도메인 또는 URL" : "Domain or URL"}</label>
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8c95]" />
                <input
                  id="advertising-domain"
                  value={domain}
                  onChange={(event) => {
                    setDomain(event.target.value);
                    if (domainError) setDomainError(null);
                  }}
                  placeholder={ko ? "도메인 또는 URL을 입력하세요." : "Enter a domain or URL"}
                  aria-invalid={Boolean(domainError)}
                  aria-describedby={domainError ? "advertising-domain-error" : undefined}
                  className="h-[44px] w-full rounded-[7px] border border-[#d8d9df] bg-white pl-10 pr-3 text-[14px] outline-none transition-colors placeholder:text-[#9698a0] focus:border-[#625ee8]"
                />
              </div>
              <button type="submit" className={darkButton}>
                {ko ? "광고 환경 알아보기" : "Explore advertising"}
                <ArrowRightIcon />
              </button>
            </div>
            {domainError && <p id="advertising-domain-error" role="alert" className="mt-2 text-left text-[12px] text-[#c7133c]">{domainError}</p>}
          </form>
          <div className="mx-auto mt-4 flex max-w-[700px] flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-[#71717a]">
            <span>{ko ? "예시:" : "Examples:"}</span>
            {["semforge.com", "samsung.com", "mckinsey.com", "nba.com"].map((example) => (
              <button key={example} type="button" onClick={() => setDomain(example)} className="font-medium text-[#235fe2] hover:underline">
                {example}
              </button>
            ))}
          </div>
          <Image
            src="/images/advertising/discovery-cards.webp"
            alt={ko ? "겹쳐진 광고 캠페인 카드 미리보기" : "Layered advertising campaign card previews"}
            width={1200}
            height={420}
            loading="eager"
            className="mx-auto mt-7 h-auto w-full max-w-[680px]"
          />
        </section>

        <section className="py-16 text-center">
          <h2 className="mx-auto max-w-[760px] text-[28px] font-semibold leading-[37px] md:text-[32px] md:leading-[42px]">
            {ko ? "투자 수익률(ROI) 향상을 위해 지속적으로 최적화되는 엔드투엔드 캠페인" : "End-to-end campaigns that continuously optimize for ROI"}
          </h2>
        </section>

        <div className="space-y-12">
          <FeatureSection
            eyebrow={ko ? "AI 지원" : "AI powered"}
            title={ko ? "광고 AI 에이전트를 만나보세요" : "Meet your Ads AI Agent"}
            description={ko ? "아이디어부터 분석까지 반복 업무를 줄이고 중요한 캠페인 의사결정에 집중하세요." : "Reduce repetitive work from ideation to analysis and focus on campaign decisions."}
            bullets={ko ? ["캠페인 성과와 경쟁 환경을 함께 분석", "예산 낭비를 줄이는 우선순위 제안", "다음 작업으로 바로 이어지는 실행 흐름"] : ["Analyze campaign and competitive context together", "Prioritize ways to reduce wasted spend", "Continue directly into the next task"]}
            href={agentHref}
            cta={ko ? "AI 에이전트 알아보기" : "Explore Ads AI Agent"}
            tone="blue"
            media={<AgentPreview ko={ko} />}
            reversed
          />
          <FeatureSection
            eyebrow={ko ? "탐색" : "Research"}
            title={ko ? "독점적인 광고 정보를 받아보세요" : "Unlock exclusive advertising intelligence"}
            description={ko ? "경쟁사의 유료 검색 키워드, 메시지와 트래픽 흐름을 확인해 더 나은 캠페인 기회를 찾으세요." : "Review competitor paid keywords, messages, and traffic trends to find better campaign opportunities."}
            bullets={ko ? ["검색 및 쇼핑 광고 경쟁사 비교", "키워드와 예상 트래픽 추이 확인", "새로운 시장과 캠페인 기회 발굴"] : ["Compare search and shopping advertisers", "Review keywords and example traffic trends", "Find new market and campaign opportunities"]}
            href={researchHref}
            cta={ko ? "광고 리서치 열기" : "Open Advertising Research"}
            tone="yellow"
            media={<TrendPreview ko={ko} />}
          />
          <FeatureSection
            eyebrow="PPC"
            title={ko ? "간편하게 PPC 캠페인을 관리하세요" : "Manage PPC campaigns with ease"}
            description={ko ? "실제 검색 수요와 비용을 바탕으로 캠페인에 필요한 키워드를 정리하고 실행 준비를 마치세요." : "Organize campaign keywords around search demand and cost, then get ready to launch."}
            bullets={ko ? ["키워드·검색량·CPC를 한 화면에서 검토", "캠페인별 키워드 그룹 구성", "제외 키워드 후보를 빠르게 정리"] : ["Review keywords, volume, and CPC together", "Build campaign keyword groups", "Organize negative keyword candidates"]}
            href={assistantHref}
            cta={ko ? "캠페인 시작하기" : "Start a campaign"}
            tone="blue"
            media={<KeywordPreview ko={ko} />}
            reversed
          />
          <FeatureSection
            eyebrow={ko ? "AI 광고 크리에이티브" : "AI ad creative"}
            title={ko ? "빠르고 간편한 광고 제작" : "Create ads quickly and easily"}
            description={ko ? "브랜드와 제품 정보를 바탕으로 광고 크리에이티브 방향을 정하고 채널에 맞는 소재를 준비하세요." : "Turn brand and product context into channel-ready creative directions."}
            bullets={ko ? ["제품 URL에서 핵심 메시지 추출", "광고 채널에 맞는 카피와 이미지 방향 제안", "검토 가능한 초안으로 안전하게 시작"] : ["Extract key messages from a product URL", "Suggest channel-ready copy and visual directions", "Start safely from a reviewable draft"]}
            href={agentHref}
            cta={ko ? "광고 크리에이티브 만들기" : "Create ad creative"}
            tone="blue"
            media={
              <div className="overflow-hidden rounded-[14px] border border-[#dfe1e7] bg-white shadow-[0_12px_28px_rgba(26,31,44,0.10)]">
                <Image
                  src="/images/advertising/ai-creative-room.webp"
                  alt={ko ? "미니멀 거실을 활용한 AI 광고 크리에이티브 예시" : "AI advertising creative featuring a minimal living room"}
                  width={960}
                  height={640}
                  loading="eager"
                  className="aspect-[3/2] w-full object-cover"
                />
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-[11px] text-[#6b6d75]">AI Creative Preview</span>
                  <span className="rounded-[5px] bg-[#9b51e8] px-2 py-1 text-[10px] font-semibold text-white">Generate for me</span>
                </div>
              </div>
            }
          />
          <FeatureSection
            eyebrow={ko ? "AI 캠페인" : "AI campaign"}
            title={ko ? "간편하게 광고를 운영하세요" : "Launch ads with confidence"}
            description={ko ? "플랫폼과 목표를 선택하고 추천 키워드를 검토한 뒤 캠페인 설정을 이어가세요." : "Choose a platform and goal, review suggested keywords, and continue campaign setup."}
            bullets={ko ? ["Google과 Meta 캠페인 워크플로 지원", "목표에 맞는 키워드와 메시지 추천", "단계별 검토와 실행 준비"] : ["Google and Meta campaign workflows", "Goal-aligned keyword and message suggestions", "Step-by-step review and export readiness"]}
            href={assistantHref}
            cta={ko ? "광고 시작" : "Start advertising"}
            tone="mint"
            media={<CampaignPreview ko={ko} />}
            reversed
          />
          <FeatureSection
            eyebrow={ko ? "AI 최적화" : "AI optimization"}
            title={ko ? "클릭 한 번으로 광고 실적 최적화" : "Optimize ad performance in one click"}
            description={ko ? "성과가 낮은 키워드를 정리하고 새로운 키워드 제안을 검토해 캠페인을 지속적으로 개선하세요." : "Review underperforming keywords and new suggestions to keep improving campaigns."}
            bullets={ko ? ["추가·제외 키워드 제안을 한 번에 검토", "성과 변화에 맞춘 지속적인 업데이트", "적용 전 모든 변경사항 확인"] : ["Review add and exclude suggestions together", "Keep recommendations updated as performance changes", "Inspect every change before applying"]}
            href={agentHref}
            cta={ko ? "최적화 시작" : "Start optimizing"}
            tone="yellow"
            media={<UpdatePreview ko={ko} />}
          />
        </div>

        <section className="mt-16 rounded-[14px] bg-[#dfe7ff] px-6 py-9 text-center md:px-16">
          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              aria-label={ko ? "이전 고객 후기" : "Previous testimonial"}
              onClick={() => setTestimonialIndex((current) => (current + TESTIMONIALS.length - 1) % TESTIMONIALS.length)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-[#313750] transition-colors hover:bg-white"
            >
              <ChevronLeftIcon />
            </button>
            <span className="text-[12px] font-semibold text-[#3d4259]">{testimonialIndex + 1}/{TESTIMONIALS.length}</span>
            <button
              type="button"
              aria-label={ko ? "다음 고객 후기" : "Next testimonial"}
              onClick={() => setTestimonialIndex((current) => (current + 1) % TESTIMONIALS.length)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-[#313750] transition-colors hover:bg-white"
            >
              <ChevronRightIcon />
            </button>
          </div>
          <blockquote className="mx-auto mt-6 max-w-[780px] text-[19px] font-semibold leading-[29px] text-[#20243b]">
            “{ko ? testimonial.quote : testimonial.quoteEn}”
          </blockquote>
          <Image
            src="/images/advertising/testimonial-avatar.webp"
            alt={ko ? testimonial.name : testimonial.nameEn}
            width={72}
            height={72}
            loading="eager"
            className="mx-auto mt-6 h-[72px] w-[72px] rounded-full object-cover"
          />
          <p className="mt-3 text-[13px] font-semibold text-[#262a40]">{ko ? testimonial.name : testimonial.nameEn}</p>
          <p className="mt-1 text-[11px] text-[#60657d]">{ko ? testimonial.role : testimonial.roleEn}</p>
        </section>

        <section className="mx-auto mt-16 max-w-[900px]">
          <h2 className="text-center text-[28px] font-semibold">{ko ? "자주 묻는 질문" : "Frequently asked questions"}</h2>
          <Accordion.Root type="single" collapsible className="mt-7 divide-y divide-[#e1e2e6] border-y border-[#e1e2e6] bg-white">
            {FAQS.map((item, index) => (
              <Accordion.Item key={item.question} value={`faq-${index}`}>
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-5 py-5 text-left text-[14px] font-medium text-[#282a31]">
                    {ko ? item.question : item.questionEn}
                    <ChevronDownIcon className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden px-5 pb-5 text-[13px] leading-[21px] text-[#62646d]">
                  {ko ? item.answer : item.answerEn}
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </section>

        <section className="mt-16 rounded-[14px] bg-[#292e68] px-6 py-12 text-center text-white md:px-16">
          <h2 className="text-[28px] font-semibold leading-[36px]">{ko ? "타겟팅된 광고를 통해 적합한 고객을 유치하세요" : "Reach the right customers with targeted advertising"}</h2>
          <p className="mx-auto mt-3 max-w-[700px] text-[14px] leading-[22px] text-white/75">
            {ko ? "경쟁사를 분석하고 광고 아이디어를 구체화해 더 나은 캠페인을 시작하세요." : "Research competitors, shape stronger ad ideas, and launch better campaigns."}
          </p>
          <Link href={assistantHref} className={cn(primaryButton, "mt-7")}>
            {ko ? "지금 바로 시작해 보세요" : "Get started now"}
            <ArrowRightIcon />
          </Link>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
