"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ChevronDownIcon } from "@/components/app/app-icons";
import { AppFooter } from "@/components/crud/AppFooter";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { CampaignSummary } from "@/components/position-tracking/PositionTrackingDashboard";

interface CreatedCampaign extends CampaignSummary {
  createdAt?: string;
}

const rankSeries = [
  { date: "8/22", mine: 18, alpha: 10, beta: 68 },
  { date: "8/23", mine: 34, alpha: 24, beta: 59 },
  { date: "8/24", mine: 22, alpha: 17, beta: 49 },
  { date: "8/25", mine: 28, alpha: 20, beta: 63 },
  { date: "8/26", mine: 19, alpha: 31, beta: 60 },
  { date: "8/27", mine: 35, alpha: 23, beta: 48 },
  { date: "8/28", mine: 13, alpha: 30, beta: 55 },
  { date: "8/29", mine: 4, alpha: 37, beta: 43 },
];

const competitionSeries = [
  { x: 38, y: 72, z: 78, domain: "you" },
  { x: 56, y: 57, z: 52, domain: "books.com" },
  { x: 72, y: 39, z: 42, domain: "newbook.com" },
  { x: 27, y: 45, z: 35, domain: "a-bookstore.com" },
];

const reportSeries = [
  { label: "월", value: 28 },
  { label: "화", value: 46 },
  { label: "수", value: 34 },
  { label: "목", value: 68 },
  { label: "금", value: 52 },
];

const FAQS = [
  {
    ko: "포지션 추적 도구의 데이터는 얼마나 자주 업데이트되나요?",
    en: "How often is Position Tracking data updated?",
    koAnswer:
      "포지션 추적 데이터는 매일 업데이트됩니다. 하나의 통합 대시보드에서 내 현재 순위뿐 아니라 경쟁자의 포지션 상승·하락, 키워드별 SERP 구성 요소, 위치·기기·검색 엔진별 가시성을 함께 확인할 수 있습니다. 검색 엔진별 캠페인을 분리해 추적하고 변화가 큰 키워드를 빠르게 찾을 수도 있습니다.",
    enAnswer:
      "Position Tracking data is updated daily. One dashboard combines your current rankings, competitor gains and losses, keyword-level SERP features, and visibility by location, device, and search engine. Separate campaigns help you spot the keywords with the most meaningful movement.",
  },
  {
    ko: "포지션 추적 도구에서는 어떤 외부 통합을 사용할 수 있나요?",
    en: "Which integrations work with Position Tracking?",
    koAnswer:
      "보고서와 대시보드 흐름을 통해 추적 결과를 팀과 공유할 수 있습니다. 내보내기와 예약 보고 기능으로 정기적인 SEO 보고 업무를 자동화하고, 보고서 페이지에서 다른 프로젝트 지표와 함께 정리할 수 있습니다. 외부 도구로 전달하기 전에도 캠페인별 핵심 변화와 경쟁사 차이를 같은 화면에서 검토할 수 있습니다.",
    enAnswer:
      "Use report and dashboard workflows to share tracking results with your team. Exports and scheduled reports simplify recurring SEO updates, while the reports area helps organize campaign findings alongside other project metrics. Review key changes and competitor gaps before distributing the report.",
  },
  {
    ko: "내 웹사이트에 대해 얼마나 많은 포지션 추적 캠페인을 실행할 수 있나요?",
    en: "How many campaigns can I run for my website?",
    koAnswer:
      "워크스페이스 권한과 구독 범위 안에서 여러 도메인과 위치, 기기, 검색 엔진 조합으로 캠페인을 만들 수 있습니다. 각 캠페인은 별도의 키워드와 경쟁사를 관리하므로 국가별 사이트, 모바일과 데스크톱, 서로 다른 검색 시장을 독립적으로 관찰하기 좋습니다. 사용 가능한 캠페인 수는 현재 워크스페이스 설정에서 확인할 수 있습니다.",
    enAnswer:
      "Create campaigns for multiple domain, location, device, and search-engine combinations within your workspace permissions and plan limits. Each campaign keeps its own keyword and competitor set, making it easier to compare countries, devices, and search markets independently. Your workspace shows the capacity currently available.",
  },
  {
    ko: "Semrush 포지션 도구는 다른 SEO 순위 추적 도구와 어떻게 다른가요?",
    en: "How is Semrush Position Tracking different?",
    koAnswer:
      "단순히 순위를 나열하는 데 그치지 않고 경쟁사 비교, 가시성 추이, SERP 구성 요소와 키워드 변동을 한 흐름에서 확인할 수 있습니다. 위치와 기기 조건을 세밀하게 나누고, 중요한 변화는 알림으로 받아볼 수 있습니다. 수집 결과를 다른 도메인 분석 지표와 연결하면 순위 변화의 배경도 함께 살펴볼 수 있습니다.",
    enAnswer:
      "It goes beyond a ranking list by combining competitor comparison, visibility trends, SERP features, and keyword movement in one workflow. Locations and devices can be tracked separately, while alerts surface meaningful changes. Collected results also connect to broader domain analytics for additional context.",
  },
  {
    ko: "이 SEO 순위 추적 도구로 경쟁자의 순위를 추적할 수 있나요?",
    en: "Can I track competitor rankings?",
    koAnswer:
      "네. 같은 키워드 결과에서 최대 5개 경쟁사의 순위를 함께 모니터링할 수 있습니다. 경쟁사 발견 화면은 내가 지정한 도메인뿐 아니라 실제 검색 결과에서 자주 마주치는 사이트도 보여 줍니다. 경쟁 구도와 가시성 차이, 키워드별 순위 변화를 비교해 우선 대응할 기회를 찾을 수 있습니다.",
    enAnswer:
      "Yes. Monitor up to five competitors across the same keyword results. Competitor discovery can surface domains that repeatedly appear beside you, not only the sites you entered manually. Compare the competitive landscape, visibility gaps, and keyword movement to prioritize your next action.",
  },
  {
    ko: "Semrush의 순위 추적 도구에서 과거 순위 데이터도 확인할 수 있나요?",
    en: "Can I review historical ranking data?",
    koAnswer:
      "네. 캠페인의 수집 이력과 가시성 변화를 저장해 장기적인 SEO 진행 상황을 확인할 수 있습니다. 기간을 바꾸며 순위 상승과 하락이 시작된 시점을 비교하고, 같은 구간의 경쟁사 변화도 함께 살펴볼 수 있습니다. 데이터가 누적될수록 일시적인 변동과 지속적인 추세를 구분하기 쉬워집니다.",
    enAnswer:
      "Yes. Campaign collection history and visibility changes are stored so you can review long-term SEO progress. Change the date range to compare when gains or losses began and inspect competitor movement over the same period. As data accumulates, temporary volatility becomes easier to separate from lasting trends.",
  },
  {
    ko: "이 SEO 순위 추적 도구로 모바일 순위를 추적할 수 있나요?",
    en: "Can I track mobile rankings?",
    koAnswer:
      "캠페인을 만들 때 데스크톱, 모바일 또는 태블릿 기기를 선택할 수 있습니다. 기기별 캠페인을 나누면 같은 키워드라도 검색 환경에 따라 달라지는 순위와 SERP 구성 요소를 비교할 수 있습니다. 모바일 사용 비중이 큰 시장에서는 별도 캠페인으로 변화 알림과 경쟁사 차이를 계속 확인하는 것이 좋습니다.",
    enAnswer:
      "Choose desktop, mobile, or tablet when creating a campaign. Separate device campaigns reveal how rankings and SERP features differ for the same keywords across search environments. In mobile-heavy markets, dedicated tracking also makes alerts and competitor gaps easier to monitor.",
  },
  {
    ko: "포지션 추적 도구에서 로컬 SEO 순위 추적은 어떻게 처리되나요?",
    en: "How does local rank tracking work?",
    koAnswer:
      "캠페인 위치를 도시 또는 대상 시장에 맞게 지정해 로컬 검색 결과를 추적할 수 있습니다. 여러 위치의 캠페인을 분리하면 같은 키워드의 지역별 성과와 실제 경쟁 구도를 비교할 수 있습니다. 로컬 팩과 지도 관련 SERP 구성 요소도 함께 확인해 특정 지역에서 노출이 바뀐 원인을 살펴보세요.",
    enAnswer:
      "Set a campaign location to the city or market you need. Separate location campaigns let you compare regional performance and the competitors that actually appear in each area. Review local-pack and map-related SERP features alongside rankings to understand why local visibility changed.",
  },
  {
    ko: "이 순위 추적 도구로 AI 개요와 기타 SERP 구성 요소를 추적할 수 있나요?",
    en: "Can it track AI Overviews and other SERP features?",
    koAnswer:
      "네. 추적 키워드에 표시된 AI 개요, 추천 스니펫, 로컬 팩, 지식 패널, 관련 질문, 쇼핑, 이미지와 동영상 같은 SERP 구성 요소를 함께 기록합니다. 내 도메인이 어떤 구성 요소에 노출되는지와 경쟁사가 차지한 영역을 비교할 수 있습니다. 구성 요소의 등장과 이탈을 순위 변화와 나란히 보면 새로운 노출 기회를 찾는 데 도움이 됩니다.",
    enAnswer:
      "Yes. Tracked features include AI Overviews, featured snippets, local packs, knowledge panels, related questions, shopping, images, and video results. Compare the features held by your domain with competitor coverage. Viewing feature gains and losses beside ranking movement helps reveal new visibility opportunities.",
  },
  {
    ko: "키워드 카니발리제이션 추적은 어떻게 설정하나요?",
    en: "How do I track keyword cannibalization?",
    koAnswer:
      "같은 키워드에 대해 서로 다른 페이지가 반복해서 노출되는지 수집 이력과 순위 URL을 비교해 확인할 수 있습니다. 기간별로 대표 URL이 자주 바뀌거나 두 페이지의 순위가 교차한다면 검색 의도가 겹치는지 살펴보세요. 변동이 큰 키워드를 기준으로 페이지 역할, 콘텐츠 범위와 내부 링크 전략을 정리하면 문제를 줄일 수 있습니다.",
    enAnswer:
      "Compare ranking URLs over time to find different pages competing for the same keyword. Frequent changes in the leading URL or crossing rank patterns can indicate overlapping search intent. Use the most volatile terms to review page purpose, content scope, and internal linking.",
  },
] as const;

const primaryButton =
  "inline-flex h-[42px] items-center justify-center rounded-[6px] bg-[#171b18] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#303633] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235fe2] disabled:cursor-not-allowed disabled:opacity-60";

const previewCard =
  "rounded-[10px] border border-[#e5e7ec] bg-white shadow-[0_12px_30px_rgba(31,35,48,0.10)]";

function ExampleBadge({ ko }: { ko: boolean }) {
  return (
    <span className="rounded-full bg-[#e7f7ef] px-2 py-1 text-[10px] font-semibold text-[#08765c]">
      {ko ? "예시 화면" : "Example preview"}
    </span>
  );
}

function DomainSetupForm({
  id,
  domain,
  setDomain,
  error,
  submitting,
  onSubmit,
  ko,
}: {
  id: string;
  domain: string;
  setDomain: (value: string) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  ko: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={id} className="sr-only">
          {ko ? "도메인" : "Domain"}
        </label>
        <input
          id={id}
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder={ko ? "도메인 입력" : "Enter domain"}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-[42px] min-w-0 flex-1 rounded-[6px] border border-[#d8dae1] bg-white px-4 text-[14px] text-[#202226] outline-none placeholder:text-[#9a9ca4] focus:border-[#235fe2]"
        />
        <button type="submit" disabled={submitting} className={primaryButton}>
          {submitting ? (ko ? "설정 중…" : "Setting up…") : ko ? "추적 설정" : "Set up tracking"}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-left text-[12px] text-[#b42346]">
          {error}
        </p>
      )}
    </form>
  );
}

function RankingPreview({ ko }: { ko: boolean }) {
  const tabs = ko
    ? ["순위", "가시성", "점유율", "예상 트래픽"]
    : ["Position", "Visibility", "Share of Voice", "Estimated traffic"];
  const [activeTab, setActiveTab] = useState(tabs[0]);

  return (
    <div className="relative mx-auto max-w-[1040px] lg:px-10">
      <aside className="mb-4 rounded-[9px] bg-[#b35bd8] p-5 text-white shadow-[0_12px_26px_rgba(108,53,135,0.24)] lg:absolute lg:left-0 lg:top-[62px] lg:z-10 lg:mb-0 lg:w-[245px]">
        <p className="text-[15px] font-semibold leading-[21px]">
          {ko ? "잠재적 기회 발굴하기" : "Discover potential opportunities"}
        </p>
        <p className="mt-2 text-[12px] leading-[19px] text-white/90">
          {ko
            ? "타겟 키워드별 SERP를 분석하고 내 사이트가 포함된 각 검색 구성 요소를 파악하세요."
            : "Analyze each target-keyword SERP and see which search features include your site."}
        </p>
      </aside>
      <aside className="mb-4 rounded-[9px] bg-[#6f45c9] p-5 text-white shadow-[0_12px_26px_rgba(77,47,148,0.24)] lg:absolute lg:right-0 lg:top-[260px] lg:z-10 lg:mb-0 lg:w-[245px]">
        <p className="text-[15px] font-semibold leading-[21px]">
          {ko ? "SEO 또는 PPC 작업 측정하기" : "Measure SEO or PPC work"}
        </p>
        <p className="mt-2 text-[12px] leading-[19px] text-white/90">
          {ko
            ? "키워드 포지션을 추적하고 전체 가시성과 시장 점유율의 변화를 비교하세요."
            : "Track keyword positions and compare changes in visibility and share of voice."}
        </p>
      </aside>

      <div className={cn(previewCard, "mx-auto max-w-[900px] overflow-hidden p-5 md:p-7")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={ko ? "순위 지표" : "Ranking metrics"}>
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "h-[32px] rounded-[5px] px-3 text-[12px] font-medium transition-colors",
                activeTab === tab
                  ? "border border-[#49a7e8] bg-[#eaf6ff] text-[#126aa6]"
                  : "text-[#696c75] hover:bg-[#f3f4f7]"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <ExampleBadge ko={ko} />
      </div>

      <div className="mt-5 overflow-x-auto rounded-[8px] border border-[#e7e8ec]">
        <table className="w-full min-w-[620px] border-collapse text-left text-[12px]">
          <thead className="bg-[#fafbfc] text-[#70727a]">
            <tr>
              <th className="px-4 py-3 font-medium">{ko ? "키워드" : "Keywords"}</th>
              <th className="px-4 py-3 font-medium">SERP Features</th>
              <th className="px-4 py-3 text-right font-medium">{activeTab}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[#e7e8ec] text-[#2d3036]">
              <td className="px-4 py-3 font-medium text-[#1681c4]">buy audible books</td>
              <td className="px-4 py-3 text-[#6b6e76]">Reviews · Site links</td>
              <td className="px-4 py-3 text-right font-semibold">1 · ↑ 16</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <h3 className="text-[14px] font-semibold text-[#34363b]">
          {ko ? "순위 변화 · 최근 8일" : "Positions · last 8 days"}
        </h3>
        <div className="mt-3 h-[280px]" aria-label={ko ? "검색 순위 예시 차트" : "Example ranking chart"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rankSeries} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#eceef2" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7a7d86" }} />
              <YAxis reversed domain={[1, 75]} ticks={[1, 25, 50, 75]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7a7d86" }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e4e5e9", fontSize: 11 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="mine" name={ko ? "내 사이트" : "You"} stroke="#22a9ef" strokeWidth={3} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="alpha" name="books.com" stroke="#ff6d32" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="beta" name="newbook.com" stroke="#4fd4a0" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      </div>
    </div>
  );
}

function CompetitionPreview({ ko }: { ko: boolean }) {
  return (
    <div className={cn(previewCard, "p-5")}>
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[#5d6069]">{ko ? "경쟁 구도" : "Competition map"}</p>
        <ExampleBadge ko={ko} />
      </div>
      <div className="mt-3 h-[190px]" aria-label={ko ? "경쟁사 가시성 예시" : "Example competitor visibility"}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#edf0f4" />
            <XAxis type="number" dataKey="x" tick={false} axisLine={false} tickLine={false} />
            <YAxis type="number" dataKey="y" tick={false} axisLine={false} tickLine={false} />
            <ZAxis type="number" dataKey="z" range={[180, 1100]} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={competitionSeries} fill="#87cdf5" fillOpacity={0.78} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 space-y-2 text-[11px]">
        {competitionSeries.slice(0, 3).map((row, index) => (
          <div key={row.domain} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-[#5e6169]">{row.domain}</span>
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#edf0f4]">
              <span className="block h-full rounded-full bg-[#25a7ed]" style={{ width: `${78 - index * 17}%` }} />
            </span>
            <strong className="w-10 text-right text-[#08765c]">{(0.54 - index * 0.16).toFixed(3)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertPreview({ ko }: { ko: boolean }) {
  const [saved, setSaved] = useState(false);

  return (
    <div className={cn(previewCard, "p-5")}>
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[#5d6069]">{ko ? "순위 변동 알림" : "Position alert"}</p>
        <ExampleBadge ko={ko} />
      </div>
      <label className="mt-4 block text-[11px] font-medium text-[#4e5159]">
        {ko ? "키워드 순위 변동" : "Alert me when a keyword"}
        <select className="mt-1.5 h-[36px] w-full rounded-[6px] border border-[#d9dbe1] bg-white px-3 text-[12px]">
          <option>{ko ? "10위 이상 변동" : "Changes by more than 10"}</option>
          <option>{ko ? "상위 10위 진입" : "Enters the top 10"}</option>
          <option>{ko ? "순위권 이탈" : "Drops out of ranking"}</option>
        </select>
      </label>
      <label className="mt-3 block text-[11px] font-medium text-[#4e5159]">
        {ko ? "대상 도메인" : "For domain"}
        <select className="mt-1.5 h-[36px] w-full rounded-[6px] border border-[#d9dbe1] bg-white px-3 text-[12px]">
          <option>yourdomain.com</option>
          <option>competitor.com</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => setSaved(true)}
        className="mt-4 h-[34px] rounded-[6px] bg-[#08a17e] px-4 text-[12px] font-semibold text-white hover:bg-[#07896c]"
      >
        {saved ? (ko ? "저장됨" : "Saved") : ko ? "저장" : "Save"}
      </button>
    </div>
  );
}

function ReportPreview({ ko }: { ko: boolean }) {
  const [scheduled, setScheduled] = useState(true);

  return (
    <div className={cn(previewCard, "p-5")}>
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[#5d6069]">{ko ? "SEO 진행 보고서" : "SEO progress report"}</p>
        <ExampleBadge ko={ko} />
      </div>
      <div className="mt-3 h-[140px]" aria-label={ko ? "보고서 차트 예시" : "Example report chart"}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={reportSeries} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
            <CartesianGrid stroke="#eef0f3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#7a7d86" }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#7a7d86" }} />
            <Bar dataKey="value" fill="#a66bf0" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[11px] text-[#4e5159]">
        <input
          type="checkbox"
          checked={scheduled}
          onChange={(event) => setScheduled(event.target.checked)}
          className="h-4 w-4 accent-[#235fe2]"
        />
        {ko ? "이 보고서를 매주 예약" : "Schedule this report weekly"}
      </label>
      <Link
        href="/my_reports/grid/"
        className="mt-4 inline-flex h-[34px] items-center rounded-[6px] bg-[#08a17e] px-4 text-[12px] font-semibold text-white hover:bg-[#07896c]"
      >
        {ko ? "보고서 열기" : "Open reports"}
      </Link>
    </div>
  );
}

function FeatureRow({
  title,
  description,
  media,
  reversed,
}: {
  title: string;
  description: string;
  media: ReactNode;
  reversed?: boolean;
}) {
  return (
    <section className="grid items-center gap-10 py-12 lg:grid-cols-2 lg:gap-20 lg:py-16">
      <div className={cn(reversed ? "lg:order-2" : "lg:order-1")}>
        <h2 className="text-[27px] font-semibold leading-[36px] text-[#202226]">{title}</h2>
        <p className="mt-4 max-w-[530px] text-[15px] leading-[25px] text-[#555861]">{description}</p>
      </div>
      <div className={cn(reversed ? "lg:order-1" : "lg:order-2")}>{media}</div>
    </section>
  );
}

function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/\.$/, "");
}

export function PositionTrackingLanding({
  campaigns,
  canCreate,
  initialDomain = "",
  initialLocation = "US",
  initialDevice = "desktop",
  initialSearchEngine = "google",
}: {
  campaigns: CampaignSummary[];
  canCreate: boolean;
  initialDomain?: string;
  initialLocation?: string;
  initialDevice?: "desktop" | "mobile";
  initialSearchEngine?: "google" | "bing";
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [domain, setDomain] = useState(initialDomain);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const campaignByDomain = useMemo(
    () => new Map(campaigns.map((campaign) => [normalizeDomain(campaign.domain), campaign])),
    [campaigns]
  );

  const updateDomain = (value: string) => {
    setDomain(value);
    if (error) setError(null);
  };

  const setupTracking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeDomain(domain);
    if (!normalized || !normalized.includes(".") || /\s/.test(normalized)) {
      setError(ko ? "올바른 도메인을 입력해 주세요." : "Enter a valid domain.");
      return;
    }

    const existing = campaignByDomain.get(normalized);
    if (existing) {
      router.push(`/position-tracking/?campaign=${encodeURIComponent(existing.id)}`);
      return;
    }

    if (!canCreate) {
      setError(ko ? "캠페인을 만들 권한이 없습니다." : "You do not have permission to create campaigns.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post<CreatedCampaign>("/api/position-tracking/", {
        name: `${normalized} ${ko ? "포지션 추적" : "Position Tracking"}`,
        domain: normalized,
        location: initialLocation,
        device: initialDevice,
        searchEngine: initialSearchEngine,
      });
      router.push(`/position-tracking/?campaign=${encodeURIComponent(response.data.id)}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ClientApiError
          ? caught.message
          : ko
            ? "포지션 추적 캠페인을 만들지 못했습니다."
            : "The tracking campaign could not be created."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#f5f6fa] text-[#202226]">
      <main className="mx-auto max-w-[1280px] px-5 pb-10 pt-6 sm:px-8">
        <section className="flex min-h-[360px] flex-col items-center justify-center rounded-[10px] border border-[#e2e4e9] bg-white px-6 py-14 text-center shadow-[0_1px_2px_rgba(24,28,38,0.03)]">
          <h1 className="text-[38px] font-semibold leading-[48px] tracking-[-0.02em] text-[#17191d] md:text-[44px] md:leading-[54px]">
            {ko ? "포지션 추적" : "Position Tracking"}
          </h1>
          <p className="mt-4 max-w-[680px] text-[16px] leading-[26px] text-[#4f525a]">
            {ko
              ? "내 사이트와 경쟁자 사이트의 순위를 매일 모니터링하세요. 위치, 기기 유형 또는 검색 엔진을 추적할 수 있습니다."
              : "Monitor your site and competitor rankings every day across locations, device types, and search engines."}
          </p>
          <div className="mt-9 w-full max-w-[900px]">
            <DomainSetupForm
              id="position-domain-hero"
              domain={domain}
              setDomain={updateDomain}
              error={error}
              submitting={submitting}
              onSubmit={setupTracking}
              ko={ko}
            />
          </div>
          {campaigns.length > 0 && (
            <Link
              href={`/position-tracking/?campaign=${encodeURIComponent(campaigns[0].id)}`}
              className="mt-5 text-[13px] font-medium text-[#235fe2] hover:underline"
            >
              {ko ? `기존 캠페인 ${campaigns.length}개 보기` : `View ${campaigns.length} existing campaigns`}
            </Link>
          )}
        </section>

        <section className="mt-5 rounded-[10px] border border-[#e2e4e9] bg-white px-6 py-14 shadow-[0_1px_2px_rgba(24,28,38,0.03)] md:px-12 md:py-16 lg:px-20">
          <h2 className="mx-auto max-w-[1000px] text-center text-[30px] font-semibold leading-[40px] tracking-[-0.015em]">
            {ko
              ? "Google부터 ChatGPT까지, 하나의 대시보드에서 모든 주요 SEO 순위를 추적하세요"
              : "Track every important SEO ranking from Google to ChatGPT in one dashboard"}
          </h2>
          <p className="mx-auto mt-3 max-w-[760px] text-center text-[14px] leading-[22px] text-[#6a6d75]">
            {ko
              ? "키워드, 경쟁사, SERP 구성 요소와 가시성 변화를 한 흐름에서 확인하세요."
              : "Review keywords, competitors, SERP features, and visibility movement in one workflow."}
          </p>
          <div className="mt-10">
            <RankingPreview ko={ko} />
          </div>

          <FeatureRow
            reversed
            title={ko ? "타겟 키워드에서 나의 경쟁자가 누구인지 파악하세요" : "Discover who competes for your target keywords"}
            description={
              ko
                ? "기존 검색 경쟁자와 AI 검색 경쟁자를 함께 관찰하고, 가시성을 높일 수 있는 기회를 찾아보세요. 예상과 다른 도메인이 실제 경쟁자로 나타나는 경우도 빠르게 확인할 수 있습니다."
                : "Monitor search and AI competitors together, then find opportunities to improve visibility—even when the real ranking competitors differ from your assumptions."
            }
            media={<CompetitionPreview ko={ko} />}
          />
          <FeatureRow
            title={ko ? "포지션의 모든 변동사항을 파악하세요" : "Stay on top of every position change"}
            description={
              ko
                ? "맞춤형 순위 추적 알림을 설정해 조치가 필요한 중요한 포지션 변경을 놓치지 마세요. 조건과 대상 도메인을 선택하고 알림 상태를 바로 확인할 수 있습니다."
                : "Create custom ranking alerts so important position changes never go unnoticed. Choose the condition and domain, then confirm the saved state immediately."
            }
            media={<AlertPreview ko={ko} />}
          />
          <FeatureRow
            reversed
            title={ko ? "SEO 진행 상황 보고서 자동화" : "Automate SEO progress reporting"}
            description={
              ko
                ? "보고서 화면에서 순위 변화를 정리하고 예약 보고를 설정하세요. 반복적인 공유 작업을 줄이고 팀이 같은 SEO 진행 상황을 확인할 수 있습니다."
                : "Summarize ranking changes and schedule recurring reports so your team can follow SEO progress without repetitive manual work."
            }
            media={<ReportPreview ko={ko} />}
          />
        </section>

        <section className="mt-5 rounded-[10px] border border-[#e2e4e9] bg-white px-6 py-12 shadow-[0_1px_2px_rgba(24,28,38,0.03)] md:px-12">
          <h2 className="text-[28px] font-semibold leading-[38px]">
            {ko ? "지금 바로 키워드를 추적해 보세요!" : "Start tracking keywords today"}
          </h2>
          <div className="mt-7 max-w-[980px]">
            <DomainSetupForm
              id="position-domain-cta"
              domain={domain}
              setDomain={updateDomain}
              error={error}
              submitting={submitting}
              onSubmit={setupTracking}
              ko={ko}
            />
          </div>
        </section>

        <section className="mt-5 rounded-[10px] border border-[#e2e4e9] bg-white px-6 pb-36 pt-14 shadow-[0_1px_2px_rgba(24,28,38,0.03)] md:px-12 lg:px-20">
          <h2 className="text-center text-[32px] font-semibold">FAQ</h2>
          <Accordion.Root
            type="multiple"
            defaultValue={FAQS.map((_, index) => `faq-${index}`)}
            className="mx-auto mt-9 max-w-[1040px] space-y-3"
          >
            {FAQS.map((item, index) => (
              <Accordion.Item key={item.ko} value={`faq-${index}`} className="border-b border-[#eef0f3] pb-3">
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center gap-3 bg-[#f4f5f8] px-5 py-4 text-left text-[15px] font-semibold leading-[22px] text-[#2a2c31] hover:bg-[#eceef3]">
                    <ChevronDownIcon className="h-4 w-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
                    <span>{ko ? item.ko : item.en}</span>
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden px-6 pb-5 pt-5 text-[14px] leading-[24px] text-[#4f525a] md:min-h-[135px] md:px-11 md:text-[15px] md:leading-[26px]">
                  {ko ? item.koAnswer : item.enAnswer}
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
