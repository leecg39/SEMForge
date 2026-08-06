// @TASK NAVER-KI-MVP - NAVER Search Ads 광고 리서치 handoff 안내
// @SPEC 사용자 계획 §3.D 로그인 기능
// @TEST src/components/advertising/NaverAdvertisingHandoffNotice.test.tsx

import type {
  NaverAdvertisingAdStats,
  NaverAdvertisingHandoff,
} from "./naver-handoff";

function formatHandoffDate(value: string, ko: boolean): string {
  return new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function handoffStatRows(
  stats: NaverAdvertisingAdStats,
  ko: boolean,
): Array<{ label: string; value: string }> {
  const rows: Array<[keyof NaverAdvertisingAdStats, string, string]> = [
    ["monthlyPcQueries", "PC 월간 검색수", "Monthly PC queries"],
    ["monthlyMobileQueries", "모바일 월간 검색수", "Monthly mobile queries"],
    ["monthlyTotalQueries", "합계 월간 검색수", "Total monthly queries"],
    ["averagePcClicks", "PC 평균 광고 클릭", "Average PC ad clicks"],
    ["averageMobileClicks", "모바일 평균 광고 클릭", "Average mobile ad clicks"],
    ["averagePcCtr", "PC 평균 광고 CTR", "Average PC ad CTR"],
    ["averageMobileCtr", "모바일 평균 광고 CTR", "Average mobile ad CTR"],
    ["competition", "광고 경쟁도", "Ad competition"],
  ];
  return rows.flatMap(([key, koLabel, enLabel]) => {
    const value = stats[key];
    return value ? [{ label: ko ? koLabel : enLabel, value }] : [];
  });
}

export function NaverAdvertisingHandoffNotice({
  handoff,
  ko,
}: {
  handoff: NaverAdvertisingHandoff;
  ko: boolean;
}) {
  const stats = handoffStatRows(handoff.adStats, ko);

  return (
    <section
      aria-labelledby="naver-ad-handoff-title"
      className="mt-5 rounded-[10px] border border-[#b9ddcf] bg-[#f1fbf7] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p id="naver-ad-handoff-title" className="text-[13px] font-semibold text-[#075f4e]">
            {ko ? "NAVER Search Ads에서 전달됨" : "Passed from NAVER Search Ads"}
          </p>
          <p id="naver-ad-handoff-guidance" className="mt-1 max-w-[780px] text-[12px] leading-5 text-[#315f56]">
            {ko
              ? "선택한 키워드를 초안 입력에 반영했습니다. 키워드와 분석 도메인을 검토·수정한 뒤 ‘실제 데이터 수집’을 눌러야 광고 리서치가 시작됩니다. 캠페인은 자동 생성되지 않습니다."
              : "Selected keywords were added as a draft. Review the keywords and domain, then choose ‘Collect real data’ to start research. No campaign is created automatically."}
          </p>
        </div>
        <span className="rounded-full border border-[#b9ddcf] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#075f4e]">
          {handoff.keywords.length}{ko ? "개 키워드" : " keywords"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#315f56]">
        {handoff.providerSource && (
          <span className="rounded-[6px] bg-white px-2.5 py-1.5">
            {ko ? "출처" : "Source"} · {handoff.providerSource}
          </span>
        )}
        {handoff.fetchedAt && (
          <span className="rounded-[6px] bg-white px-2.5 py-1.5">
            {ko ? "수집 시각" : "Fetched"} · {formatHandoffDate(handoff.fetchedAt, ko)}
          </span>
        )}
        {handoff.measurement && (
          <span className="rounded-[6px] bg-white px-2.5 py-1.5">
            {ko ? "측정 방식" : "Measurement"} · {handoff.measurement}
          </span>
        )}
      </div>
      {stats.length > 0 && (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[7px] border border-[#d9eee6] bg-white px-3 py-2">
              <dt className="text-[10px] text-app-text-secondary">{stat.label}</dt>
              <dd className="mt-0.5 text-[12px] font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-[10px] leading-4 text-[#4b6f67]">
        {ko
          ? "전달된 참고값은 새 리서치의 실측 결과가 아닙니다. NAVER 광고 통계 맥락이며 자연검색 난이도 또는 경쟁사 광고 이력을 뜻하지 않습니다."
          : "Transferred reference values are not results from a new research run. They are NAVER advertising metrics, not organic difficulty or competitor ad history."}
      </p>
    </section>
  );
}
