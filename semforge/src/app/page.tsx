// @TASK P1-F1-T1 - Independent SEMForge landing page
// @SPEC SEMForge paid beta plan#weekly-visibility-report
// @TEST src/components/core-shell/allowed-pages.test.ts
import Link from "next/link";
import { CoreIcon } from "@/components/core-shell/core-icon";
import { ProductLimitSummary } from "@/components/core-shell/product-limit-summary";
import { PublicShell } from "@/components/core-shell/public-shell";

const signals = [
  {
    label: "Google 순위",
    title: "고객 도메인의 실제 노출 위치",
    description: "한국·한국어·데스크톱 기준 상위 100개 결과에서 가장 높은 순위를 기록합니다.",
  },
  {
    label: "AI Overview",
    title: "답변 노출과 인용 여부",
    description: "확인할 수 없는 인용은 미노출로 단정하지 않고 ‘확인 불가’로 구분합니다.",
  },
  {
    label: "Search Console",
    title: "성숙된 검색 성과 구간",
    description: "데이터 지연을 고려한 동일한 7일 구간으로 클릭과 노출 변화를 비교합니다.",
  },
  {
    label: "NAVER 수요",
    title: "검색량·추이·검색 결과 규모",
    description: "공식 API가 제공하는 범위만 사용하며 순위나 경쟁도로 오해할 표현을 만들지 않습니다.",
  },
] as const;

export default function LandingPage() {
  return (
    <PublicShell>
      <section className="sf-hero">
        <div className="sf-hero__copy">
          <span className="sf-beta-badge">한국 SEO 대행사 · 초대 전용 베타</span>
          <h1>이번 주 검색 가시성을<br />한 장으로 설명하세요.</h1>
          <p>
            흩어진 검색 신호를 같은 기간과 기준으로 정리해, 고객에게 무엇이 달라졌는지
            매주 명확하게 전달합니다.
          </p>
          <div className="sf-hero__actions">
            <Link className="sf-button sf-button--primary" href="/login">
              초대 계정으로 로그인
              <CoreIcon name="arrow" size={18} />
            </Link>
            <span>월 49,000원 · VAT 포함 · 사이트 3개</span>
          </div>
        </div>
        <div className="sf-report-preview" aria-label="주간 리포트 데이터 준비 상태 예시">
          <div className="sf-report-preview__head">
            <div>
              <small>WEEKLY VISIBILITY NOTE</small>
              <strong>주간 검색 가시성</strong>
            </div>
            <span>수집 전</span>
          </div>
          <div className="sf-report-preview__line" />
          <dl>
            <div><dt>Google 순위</dt><dd>연결 필요</dd></div>
            <div><dt>AI Overview</dt><dd>연결 필요</dd></div>
            <div><dt>Search Console</dt><dd>연결 필요</dd></div>
            <div><dt>NAVER 수요</dt><dd>연결 필요</dd></div>
          </dl>
          <p>데이터가 없을 때 수치를 꾸며내지 않습니다.</p>
        </div>
      </section>

      <section className="sf-public-section" aria-labelledby="signals-title">
        <div className="sf-public-section__heading">
          <p className="sf-eyebrow">한 주의 네 가지 신호</p>
          <h2 id="signals-title">확인된 것과 확인할 수 없는 것을 함께 기록합니다.</h2>
        </div>
        <div className="sf-signal-grid">
          {signals.map((signal) => (
            <article key={signal.label}>
              <span>{signal.label}</span>
              <h3>{signal.title}</h3>
              <p>{signal.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sf-public-section sf-public-section--limits">
        <ProductLimitSummary />
      </section>

      <section className="sf-public-cta">
        <div>
          <p className="sf-eyebrow">매주 월요일 오전</p>
          <h2>웹·이메일·PDF가 같은 스냅샷을 공유합니다.</h2>
          <p>발송된 리포트는 늦게 도착한 데이터로 조용히 바뀌지 않습니다.</p>
        </div>
        <Link className="sf-button sf-button--primary" href="/login">비공개 베타 로그인</Link>
      </section>
    </PublicShell>
  );
}
