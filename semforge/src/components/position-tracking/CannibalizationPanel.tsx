import type { CannibalizationInsight } from "@/server/position-tracking/page-insights";
import {
  toProvenanceBadge,
  type ProviderBadgeMeta,
  type ProviderResult,
} from "@/server/providers/types";

interface CannibalizationPanelProps {
  /** null은 API 응답을 기다리는 초기/재조회 상태다. */
  result: ProviderResult<CannibalizationInsight[]> | null;
}

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatPositionWithUnit(value: number | null): string {
  return value === null ? "—" : `${NUMBER_FORMATTER.format(value)}위`;
}

function FormattedDateTime({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>{value}</>;
  return (
    <time dateTime={date.toISOString()}>{DATE_TIME_FORMATTER.format(date)}</time>
  );
}

function StatusBadge({ badge }: { badge: ProviderBadgeMeta }) {
  const styles =
    badge.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : badge.tone === "danger"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-zinc-200 bg-zinc-100 text-zinc-600";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}
      aria-label={`데이터 상태: ${badge.label}`}
      title={badge.reason}
    >
      {badge.label}
    </span>
  );
}

function UrlPositions({ insight }: { insight: CannibalizationInsight }) {
  return (
    <ul className="space-y-1.5">
      {insight.urls.map((item) => (
        <li key={item.url} className="flex min-w-0 items-start justify-between gap-3">
          <span className="min-w-0 break-all text-app-text">{item.url}</span>
          <span className="shrink-0 tabular-nums text-app-text-secondary">
            {formatPositionWithUnit(item.position)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function compareSeverity(
  left: CannibalizationInsight,
  right: CannibalizationInsight,
): number {
  if (left.competingCount !== right.competingCount) {
    return right.competingCount - left.competingCount;
  }
  if (left.bestPosition === null) return right.bestPosition === null ? 0 : -1;
  if (right.bestPosition === null) return 1;
  return (
    right.bestPosition - left.bestPosition || left.keyword.localeCompare(right.keyword)
  );
}

/** 동일 키워드에서 경쟁하는 자사 URL을 심각도 순으로 표시한다. */
export function CannibalizationPanel({ result }: CannibalizationPanelProps) {
  if (result === null) {
    return (
      <section
        className="rounded-[10px] border border-app-border bg-white p-4"
        aria-busy="true"
      >
        <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">
          키워드 카니발리제이션
        </h3>
        <p
          className="mt-4 text-[13px] leading-[20px] text-app-text-secondary"
          role="status"
        >
          카니발리제이션 데이터를 불러오는 중…
        </p>
      </section>
    );
  }

  const badge = toProvenanceBadge(result);
  const insights = (result.data ?? []).toSorted(compareSeverity);
  const blocked = result.status !== "live";
  const missingData = result.status === "live" && result.data === undefined;

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">
            키워드 카니발리제이션
          </h3>
          <p className="mt-1 text-[12px] leading-[18px] text-app-text-secondary">
            같은 키워드에 자사 페이지가 여러 개 노출되면 서로 순위를 잠식할 수 있습니다.
          </p>
          <p className="mt-1 text-[12px] text-app-text-secondary">
            출처: {badge.source} · 수집 시각:{" "}
            <FormattedDateTime value={badge.fetchedAt} />
          </p>
        </div>
        <StatusBadge badge={badge} />
      </div>

      {blocked && (
        <p
          className={`mt-4 text-[13px] leading-[20px] ${
            result.status === "error" ? "text-app-red" : "text-app-text-secondary"
          }`}
          role={result.status === "error" ? "alert" : "status"}
        >
          {result.reason ?? "카니발리제이션 데이터를 표시할 수 없습니다."}
        </p>
      )}

      {missingData && (
        <p className="mt-4 text-[13px] leading-[20px] text-app-red" role="alert">
          카니발리제이션 응답에 표시할 데이터가 없습니다.
        </p>
      )}

      {!blocked && !missingData && insights.length === 0 && (
        <div
          className="mt-4 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3"
          role="status"
        >
          <p className="text-[13px] font-semibold text-emerald-700">문제 없음</p>
          <p className="mt-0.5 text-[12px] leading-[18px] text-emerald-700">
            같은 키워드에서 서로 경쟁하는 자사 URL이 발견되지 않았습니다.
          </p>
        </div>
      )}

      {!blocked && !missingData && insights.length > 0 && (
        <>
          <ol className="mt-4 space-y-3 sm:hidden" aria-label="심각도 순 카니발리제이션">
            {insights.map((insight, index) => (
              <li
                key={insight.keyword}
                className="rounded-[8px] border border-app-border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all text-[13px] font-semibold text-app-text">
                      {insight.keyword}
                    </p>
                    <p className="mt-0.5 text-[12px] text-app-text-secondary">
                      심각도 {NUMBER_FORMATTER.format(index + 1)} · 경쟁 URL{" "}
                      <span className="tabular-nums">
                        {NUMBER_FORMATTER.format(insight.competingCount)}개
                      </span>
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                    aria-label={`주의: 자사 URL ${insight.competingCount}개가 경쟁 중`}
                  >
                    순위 잠식
                  </span>
                </div>
                <div className="mt-3 border-t border-app-border pt-3 text-[12px]">
                  <UrlPositions insight={insight} />
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[700px] text-left text-[13px]">
              <caption className="sr-only">
                심각도 순 키워드 카니발리제이션과 경쟁 중인 자사 URL별 순위
              </caption>
              <thead>
                <tr className="border-b border-app-border text-[12px] text-app-text-secondary">
                  <th scope="col" className="w-16 py-2 pr-4 text-right font-medium">
                    심각도
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    키워드
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    URL 수
                  </th>
                  <th scope="col" className="py-2 pl-4 font-medium">
                    경쟁 중인 자사 URL · 순위
                  </th>
                </tr>
              </thead>
              <tbody>
                {insights.map((insight, index) => (
                  <tr
                    key={insight.keyword}
                    className="border-b border-app-border align-top last:border-b-0"
                  >
                    <td className="py-3 pr-4 text-right tabular-nums text-app-text-secondary">
                      {NUMBER_FORMATTER.format(index + 1)}
                    </td>
                    <th scope="row" className="break-all px-4 py-3 font-medium text-app-text">
                      {insight.keyword}
                    </th>
                    <td className="px-4 py-3 text-right tabular-nums text-app-text">
                      {NUMBER_FORMATTER.format(insight.competingCount)}
                    </td>
                    <td className="py-3 pl-4 text-[12px]">
                      <UrlPositions insight={insight} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
