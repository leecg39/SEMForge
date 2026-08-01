import type { MetricCard } from "@/components/position-tracking/metric-cards";

/** 값이 없으면 0 이 아니라 — 로 표시한다. 0 은 "실제로 0" 이라는 주장이다. */
function formatValue(card: MetricCard): string {
  if (card.value === null) return "—";
  const formatted = card.value.toFixed(card.precision);
  return card.unit ? `${formatted}${card.unit}` : formatted;
}

function DeltaBadge({ card }: { card: MetricCard }) {
  const delta = card.delta;
  if (!delta || delta.absolute === null || delta.direction === null) {
    return <span className="text-[12px] text-app-text-secondary">비교 기간 없음</span>;
  }
  const rising = delta.direction === "up";
  const flat = delta.direction === "flat";
  const sign = rising ? "+" : delta.absolute < 0 ? "" : "";
  return (
    <span
      className={`text-[12px] font-medium ${
        flat ? "text-app-text-secondary" : rising ? "text-[#0a6b57]" : "text-[#c7133c]"
      }`}
    >
      {sign}
      {delta.absolute.toFixed(card.precision)}
      {card.unit ?? ""}
      {delta.percent !== null && ` (${delta.percent > 0 ? "+" : ""}${delta.percent.toFixed(1)}%)`}
    </span>
  );
}

/** 관측값을 0~100 높이 비율로 그리는 최소 스파크라인. 값이 없는 구간은 건너뛴다. */
function Sparkline({ points }: { points: (number | null)[] }) {
  const values = points.filter((point): point is number => point !== null);
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = 100 / Math.max(1, points.length - 1);
  const path = points
    .map((point, index) =>
      point === null ? null : `${index * step},${30 - ((point - min) / span) * 28}`
    )
    .filter((segment): segment is string => segment !== null)
    .join(" ");

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-[30px] w-full" aria-hidden>
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-app-link" />
    </svg>
  );
}

/** 현황 탭 상단 지표 카드 3종. */
export function MetricCards({ cards }: { cards: MetricCard[] }) {
  return (
    <section aria-label="핵심 지표" className="mt-4 grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <article
          key={card.key}
          className="rounded-[10px] border border-app-border bg-white p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[12px] text-app-text-secondary">{card.label}</h3>
            {card.status === "unavailable" && (
              <span
                className="rounded-[4px] bg-app-bg px-1.5 py-[1px] text-[10px] font-medium text-app-text-secondary"
                title={card.reason}
              >
                수집 대기
              </span>
            )}
          </div>
          <p className="mt-1 text-[24px] font-semibold tabular-nums">{formatValue(card)}</p>
          {card.status === "unavailable" ? (
            <p className="mt-1 text-[12px] leading-5 text-app-text-secondary">{card.reason}</p>
          ) : (
            <DeltaBadge card={card} />
          )}
          {card.status === "live" && <Sparkline points={card.sparkline} />}
        </article>
      ))}
    </section>
  );
}
