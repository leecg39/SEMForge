// @TASK P1-F1-T1 - Paid beta product limits
// @SPEC SEMForge paid beta plan#limits
// @TEST src/components/core-shell/core-shell.test.ts
const limits = [
  { label: "워크스페이스당 사이트", value: 3, note: "대행사 고객 사이트 기준" },
  { label: "사이트당 Google 순위 키워드", value: 20, note: "한국·한국어·데스크톱" },
  { label: "사이트당 AI Overview 프롬프트", value: 20, note: "Google AI Overview" },
] as const;

export function ProductLimitSummary() {
  return (
    <section className="sf-card" aria-labelledby="product-limits-title">
      <div className="sf-section-heading">
        <div>
          <p className="sf-eyebrow">비공개 베타 한도</p>
          <h2 id="product-limits-title">작게 시작하고 매주 정확히 확인합니다</h2>
        </div>
      </div>
      <dl className="sf-limit-grid">
        {limits.map((limit) => (
          <div className="sf-limit" key={limit.label}>
            <dt>{limit.label}</dt>
            <dd>{limit.value}</dd>
            <small>{limit.note}</small>
          </div>
        ))}
      </dl>
    </section>
  );
}
