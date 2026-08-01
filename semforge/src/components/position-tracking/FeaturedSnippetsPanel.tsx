import type {
  FeaturedSnippetInsights,
  FeaturedSnippetObservation,
} from "@/server/position-tracking/page-insights";
import {
  toProvenanceBadge,
  type ProviderBadgeMeta,
  type ProviderResult,
} from "@/server/providers/types";

interface FeaturedSnippetsPanelProps {
  /** null은 API 응답을 기다리는 초기/재조회 상태다. */
  result: ProviderResult<FeaturedSnippetInsights> | null;
}

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatPosition(value: number | null): string {
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

function ObservationBadge({ kind }: { kind: "owned" | "opportunity" }) {
  const owned = kind === "owned";
  const label = owned ? "자사 점유" : "기회";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        owned ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
      aria-label={`추천 스니펫 상태: ${label}`}
    >
      {label}
    </span>
  );
}

function MobileObservationCard({
  observation,
  kind,
}: {
  observation: FeaturedSnippetObservation;
  kind: "owned" | "opportunity";
}) {
  return (
    <li className="rounded-[8px] border border-app-border p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-all text-[13px] font-semibold text-app-text">
          {observation.keyword}
        </p>
        <ObservationBadge kind={kind} />
      </div>
      <dl className="mt-3 space-y-2 text-[12px]">
        <div>
          <dt className="text-app-text-secondary">도메인</dt>
          <dd className="mt-0.5 break-all text-app-text">{observation.domain}</dd>
        </div>
        <div>
          <dt className="text-app-text-secondary">URL</dt>
          <dd className="mt-0.5 break-all text-app-text">{observation.url}</dd>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-app-text-secondary">순위</dt>
            <dd className="mt-0.5 tabular-nums text-app-text">
              {formatPosition(observation.position)}
            </dd>
          </div>
          <div>
            <dt className="text-app-text-secondary">관측 시각</dt>
            <dd className="mt-0.5 tabular-nums text-app-text">
              <FormattedDateTime value={observation.capturedAt} />
            </dd>
          </div>
        </div>
      </dl>
    </li>
  );
}

function ObservationTable({
  observations,
  kind,
  caption,
}: {
  observations: FeaturedSnippetObservation[];
  kind: "owned" | "opportunity";
  caption: string;
}) {
  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-app-border text-[12px] text-app-text-secondary">
            <th scope="col" className="py-2 pr-4 font-medium">
              키워드
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              상태
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              도메인
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              URL
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              순위
            </th>
            <th scope="col" className="py-2 pl-4 text-right font-medium">
              관측 시각
            </th>
          </tr>
        </thead>
        <tbody>
          {observations.map((observation, index) => (
            <tr
              key={`${observation.keyword}:${observation.url}:${observation.capturedAt ?? "없음"}:${index}`}
              className="border-b border-app-border align-top last:border-b-0"
            >
              <th scope="row" className="break-all py-3 pr-4 font-medium text-app-text">
                {observation.keyword}
              </th>
              <td className="px-4 py-3">
                <ObservationBadge kind={kind} />
              </td>
              <td className="max-w-[160px] break-all px-4 py-3 text-app-text">
                {observation.domain}
              </td>
              <td className="max-w-[300px] break-all px-4 py-3 text-app-text">
                {observation.url}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-app-text">
                {formatPosition(observation.position)}
              </td>
              <td className="whitespace-nowrap py-3 pl-4 text-right tabular-nums text-app-text-secondary">
                <FormattedDateTime value={observation.capturedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObservationGroup({
  title,
  description,
  emptyMessage,
  observations,
  kind,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  observations: FeaturedSnippetObservation[];
  kind: "owned" | "opportunity";
}) {
  return (
    <section aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h4 className="text-[13px] font-semibold text-app-text">{title}</h4>
          <p className="mt-0.5 text-[12px] leading-[18px] text-app-text-secondary">
            {description}
          </p>
        </div>
        <span className="text-[12px] tabular-nums text-app-text-secondary">
          {NUMBER_FORMATTER.format(observations.length)}건
        </span>
      </div>

      {observations.length === 0 ? (
        <p className="mt-3 rounded-[8px] bg-[#f7f8fa] px-3 py-2 text-[12px] text-app-text-secondary">
          {emptyMessage}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-3 sm:hidden" aria-label={`${title} 목록`}>
            {observations.map((observation, index) => (
              <MobileObservationCard
                key={`${observation.keyword}:${observation.url}:${observation.capturedAt ?? "없음"}:${index}`}
                observation={observation}
                kind={kind}
              />
            ))}
          </ul>
          <div className="mt-3">
            <ObservationTable
              observations={observations}
              kind={kind}
              caption={`${title}: 키워드, 점유 도메인, URL, 순위 및 관측 시각`}
            />
          </div>
        </>
      )}
    </section>
  );
}

/** 추천 스니펫을 자사 점유와 경쟁사 점유 기회로 나눠 표시한다. */
export function FeaturedSnippetsPanel({ result }: FeaturedSnippetsPanelProps) {
  if (result === null) {
    return (
      <section
        className="rounded-[10px] border border-app-border bg-white p-4"
        aria-busy="true"
      >
        <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">
          추천 스니펫
        </h3>
        <p
          className="mt-4 text-[13px] leading-[20px] text-app-text-secondary"
          role="status"
        >
          추천 스니펫 데이터를 불러오는 중…
        </p>
      </section>
    );
  }

  const badge = toProvenanceBadge(result);
  const insights = result.data;
  const blocked = result.status !== "live";
  const missingData = result.status === "live" && insights === undefined;
  const isEmpty =
    !insights || (insights.owned.length === 0 && insights.competitors.length === 0);

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">
            추천 스니펫
          </h3>
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
          {result.reason ?? "추천 스니펫 데이터를 표시할 수 없습니다."}
        </p>
      )}

      {missingData && (
        <p className="mt-4 text-[13px] leading-[20px] text-app-red" role="alert">
          추천 스니펫 응답에 표시할 데이터가 없습니다.
        </p>
      )}

      {!blocked && !missingData && isEmpty && (
        <p
          className="mt-4 text-[13px] leading-[20px] text-app-text-secondary"
          role="status"
        >
          아직 관측된 추천 스니펫이 없습니다.
        </p>
      )}

      {!blocked && !missingData && insights && !isEmpty && (
        <div className="mt-4 space-y-6">
          <ObservationGroup
            title="자사가 차지한 스니펫"
            description="현재 자사 페이지가 추천 스니펫을 점유하고 있습니다."
            emptyMessage="현재 자사가 점유한 추천 스니펫이 없습니다."
            observations={insights.owned}
            kind="owned"
          />
          <ObservationGroup
            title="경쟁사가 차지한 스니펫"
            description="콘텐츠를 보강해 자사가 확보할 수 있는 추천 스니펫 기회입니다."
            emptyMessage="경쟁사가 점유한 추천 스니펫이 없어 현재 확인된 탈환 기회가 없습니다."
            observations={insights.competitors}
            kind="opportunity"
          />
        </div>
      )}
    </section>
  );
}
