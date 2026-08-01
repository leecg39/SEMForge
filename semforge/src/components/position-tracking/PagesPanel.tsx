import type { PageRanking } from "@/server/position-tracking/page-insights";
import {
  toProvenanceBadge,
  type ProviderBadgeMeta,
  type ProviderResult,
} from "@/server/providers/types";

interface PagesPanelProps {
  /** null은 API 응답을 기다리는 초기/재조회 상태다. */
  result: ProviderResult<PageRanking[]> | null;
}

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatNumber(value: number | null): string {
  return value === null ? "—" : NUMBER_FORMATTER.format(value);
}

function FormattedDateTime({ value }: { value: string | null }) {
  if (value === null) return <>—</>;
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

function Provenance({ badge }: { badge: ProviderBadgeMeta }) {
  return (
    <p className="mt-1 text-[12px] text-app-text-secondary">
      출처: {badge.source} · 수집 시각:{" "}
      <FormattedDateTime value={badge.fetchedAt} />
    </p>
  );
}

function MobilePageCard({ page }: { page: PageRanking }) {
  return (
    <li className="rounded-[8px] border border-app-border p-3">
      <p className="break-all text-[13px] font-medium leading-[20px] text-app-text">
        {page.url}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <div>
          <dt className="text-[12px] text-app-text-secondary">키워드 수</dt>
          <dd className="mt-0.5 tabular-nums text-app-text">
            {NUMBER_FORMATTER.format(page.keywords)}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-app-text-secondary">최고 순위</dt>
          <dd className="mt-0.5 tabular-nums text-app-text">
            {formatNumber(page.bestPosition)}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-app-text-secondary">평균 순위</dt>
          <dd className="mt-0.5 tabular-nums text-app-text">
            {formatNumber(page.averagePosition)}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-app-text-secondary">마지막 관측</dt>
          <dd className="mt-0.5 tabular-nums text-app-text">
            <FormattedDateTime value={page.lastSeenAt} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** URL별 자연 검색 순위 집계를 조회 없이 표시한다. */
export function PagesPanel({ result }: PagesPanelProps) {
  if (result === null) {
    return (
      <section
        className="rounded-[10px] border border-app-border bg-white p-4"
        aria-busy="true"
      >
        <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">
          페이지 순위
        </h3>
        <p
          className="mt-4 text-[13px] leading-[20px] text-app-text-secondary"
          role="status"
        >
          페이지 순위 데이터를 불러오는 중…
        </p>
      </section>
    );
  }

  const badge = toProvenanceBadge(result);
  const pages = result.data ?? [];
  const blocked = result.status !== "live";
  const missingData = result.status === "live" && result.data === undefined;

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">
            페이지 순위
          </h3>
          <Provenance badge={badge} />
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
          {result.reason ?? "페이지 순위 데이터를 표시할 수 없습니다."}
        </p>
      )}

      {missingData && (
        <p className="mt-4 text-[13px] leading-[20px] text-app-red" role="alert">
          페이지 순위 응답에 표시할 데이터가 없습니다.
        </p>
      )}

      {!blocked && !missingData && pages.length === 0 && (
        <p
          className="mt-4 text-[13px] leading-[20px] text-app-text-secondary"
          role="status"
        >
          아직 관측된 페이지 순위가 없습니다.
        </p>
      )}

      {!blocked && !missingData && pages.length > 0 && (
        <>
          <ul className="mt-4 space-y-3 sm:hidden" aria-label="URL별 페이지 순위">
            {pages.map((page) => (
              <MobilePageCard key={page.url} page={page} />
            ))}
          </ul>

          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <caption className="sr-only">
                URL별 키워드 수, 최고 순위, 평균 순위 및 마지막 관측 시각
              </caption>
              <thead>
                <tr className="border-b border-app-border text-[12px] text-app-text-secondary">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    URL
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    키워드 수
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    최고 순위
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    평균 순위
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">
                    마지막 관측
                  </th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.url} className="border-b border-app-border last:border-b-0">
                    <th
                      scope="row"
                      className="max-w-[360px] break-all py-3 pr-4 font-medium text-app-text"
                    >
                      {page.url}
                    </th>
                    <td className="px-4 py-3 text-right tabular-nums text-app-text">
                      {NUMBER_FORMATTER.format(page.keywords)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-app-text">
                      {formatNumber(page.bestPosition)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-app-text">
                      {formatNumber(page.averagePosition)}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-4 text-right tabular-nums text-app-text-secondary">
                      <FormattedDateTime value={page.lastSeenAt} />
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
