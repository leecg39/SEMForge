import type { AiAnswerPlatform } from "@/db/schema/ai-visibility";
import type {
  PlatformBreakdown,
  PlatformBreakdownItem,
} from "@/server/ai-visibility/platform-breakdown";
import {
  toProvenanceBadge,
  type ProviderBadgeMeta,
  type ProviderResult,
} from "@/server/providers/types";

interface AiPlatformBreakdownPanelProps {
  result: ProviderResult<PlatformBreakdown>;
}

const PLATFORM_LABELS: Record<AiAnswerPlatform, string> = {
  google_aio: "Google AI 개요 (AIO)",
  google_ai_mode: "Google AI Mode",
  grok: "Grok",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

const PLATFORM_SOURCES: Record<AiAnswerPlatform, string> = {
  google_aio: "talordata",
  google_ai_mode: "google-ai-mode",
  grok: "xai",
  chatgpt: "openai",
  gemini: "google-gemini",
  perplexity: "perplexity",
};

const COUNT_FORMATTER = new Intl.NumberFormat("ko-KR");
const RATE_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCount(value: number | null): string {
  return value === null ? "—" : COUNT_FORMATTER.format(value);
}

function formatRate(value: number | null): string {
  return value === null ? "—" : `${RATE_FORMATTER.format(value)}%`;
}

function rowBadge(
  row: PlatformBreakdownItem,
  fetchedAt: string,
): ProviderBadgeMeta {
  const providerResult: ProviderResult<PlatformBreakdownItem> = {
    status: row.status,
    source: PLATFORM_SOURCES[row.platform],
    fetchedAt,
    ...(row.status === "live" ? { data: row } : {}),
    ...(row.reason === undefined ? {} : { reason: row.reason }),
  };

  const badge = toProvenanceBadge(providerResult);
  if (row.dataStatus === "empty") {
    return { ...badge, label: "관측 없음", tone: "muted" };
  }
  if (row.dataStatus === "observed") {
    return { ...badge, label: "실데이터" };
  }
  return badge;
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
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}
      aria-label={`데이터 상태: ${badge.label}`}
    >
      {badge.label}
    </span>
  );
}

function ProvenanceText({ badge }: { badge: ProviderBadgeMeta }) {
  return (
    <p className="mt-1 text-xs text-zinc-400">
      출처: {badge.source} · 기준 시각:{" "}
      <time dateTime={badge.fetchedAt}>
        {DATE_TIME_FORMATTER.format(new Date(badge.fetchedAt))}
      </time>
    </p>
  );
}

function MobilePlatformCard({
  row,
  fetchedAt,
}: {
  row: PlatformBreakdownItem;
  fetchedAt: string;
}) {
  const badge = rowBadge(row, fetchedAt);

  return (
    <li className="rounded-lg border border-zinc-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">
            {PLATFORM_LABELS[row.platform]}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">출처: {badge.source}</p>
        </div>
        <StatusBadge badge={badge} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-zinc-500">관측</dt>
          <dd className="mt-0.5 font-medium text-zinc-900">
            {formatCount(row.observed)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">언급</dt>
          <dd className="mt-0.5 font-medium text-zinc-900">
            {formatCount(row.mentioned)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">언급률</dt>
          <dd className="mt-0.5 font-medium text-zinc-900">
            {formatRate(row.mentionRate)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">판정 불가</dt>
          <dd className="mt-0.5 font-medium text-zinc-900">
            {formatCount(row.unknownMentionCount)}
          </dd>
        </div>
      </dl>
      {row.reason && <p className="mt-3 text-xs text-zinc-500">{row.reason}</p>}
    </li>
  );
}

/** fetch나 클라이언트 상태 없이 전달받은 가시성 집계만 표시한다. */
export function AiPlatformBreakdownPanel({
  result,
}: AiPlatformBreakdownPanelProps) {
  const provenance = toProvenanceBadge(result);
  const breakdown = result.data;

  if (!breakdown) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">AI 플랫폼별 가시성</h2>
          <StatusBadge badge={provenance} />
        </div>
        <ProvenanceText badge={provenance} />
        <p className="mt-3 text-sm text-zinc-500">
          {result.reason ?? "플랫폼 가시성 데이터를 표시할 수 없습니다."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">AI 플랫폼별 가시성</h2>
          <p className="mt-1 text-xs text-zinc-500">
            판정 불가 관측은 언급률 계산에서 제외합니다.
          </p>
          <ProvenanceText badge={provenance} />
        </div>
        <StatusBadge badge={provenance} />
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-zinc-50 px-4 py-3">
          <dt className="text-xs font-medium text-zinc-500">총 관측</dt>
          <dd className="mt-1 text-xl font-semibold text-zinc-900">
            {COUNT_FORMATTER.format(breakdown.summary.totalObserved)}
          </dd>
        </div>
        <div className="rounded-lg bg-zinc-50 px-4 py-3">
          <dt className="text-xs font-medium text-zinc-500">실데이터 플랫폼</dt>
          <dd className="mt-1 text-xl font-semibold text-zinc-900">
            {COUNT_FORMATTER.format(breakdown.summary.dataPlatformCount)}
          </dd>
        </div>
        <div className="rounded-lg bg-zinc-50 px-4 py-3">
          <dt className="text-xs font-medium text-zinc-500">미연동 플랫폼</dt>
          <dd className="mt-1 text-xl font-semibold text-zinc-900">
            {COUNT_FORMATTER.format(breakdown.summary.unavailablePlatformCount)}
          </dd>
        </div>
      </dl>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:hidden" aria-label="AI 플랫폼별 가시성">
        {breakdown.platforms.map((row) => (
          <MobilePlatformCard key={row.platform} row={row} fetchedAt={result.fetchedAt} />
        ))}
      </ul>

      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">
            AI 플랫폼별 연결 상태, 관측 수, 브랜드 언급 수, 언급률 및 판정 불가 수
          </caption>
          <thead>
            <tr className="border-b border-zinc-200 text-xs text-zinc-500">
              <th scope="col" className="py-2 pr-4 font-medium">플랫폼</th>
              <th scope="col" className="py-2 pr-4 font-medium">상태</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">관측</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">언급</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">언급률</th>
              <th scope="col" className="py-2 text-right font-medium">판정 불가</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.platforms.map((row) => {
              const badge = rowBadge(row, result.fetchedAt);
              return (
                <tr key={row.platform} className="border-b border-zinc-100 align-top last:border-0">
                  <th scope="row" className="py-3 pr-4 font-medium text-zinc-900">
                    {PLATFORM_LABELS[row.platform]}
                    <span className="mt-0.5 block text-xs font-normal text-zinc-400">
                      출처: {badge.source}
                    </span>
                  </th>
                  <td className="py-3 pr-4">
                    <StatusBadge badge={badge} />
                    {row.reason && (
                      <p className="mt-1 max-w-64 text-xs leading-5 text-zinc-500">
                        {row.reason}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-zinc-700">
                    {formatCount(row.observed)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-zinc-700">
                    {formatCount(row.mentioned)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-zinc-700">
                    {formatRate(row.mentionRate)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-zinc-700">
                    {formatCount(row.unknownMentionCount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
