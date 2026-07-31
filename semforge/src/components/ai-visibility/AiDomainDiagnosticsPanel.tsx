import type { AiVisibilityDomainDiagnostic } from "@/server/ai-visibility/domain-diagnostic";
import type { LlmsTxtChecks } from "@/server/ai-visibility/llms-txt";

const PANEL = "rounded-xl border border-zinc-200 bg-white p-5";

type BadgeTone = "live" | "warn" | "danger" | "muted";

const LLMS_CHECK_LABELS = [
  { key: "h1", label: "H1 제목" },
  { key: "summary", label: "한 줄 요약" },
  { key: "sections", label: "H2 섹션" },
  { key: "links", label: "링크" },
  { key: "absoluteUrls", label: "절대 URL" },
  { key: "linkTitles", label: "링크 제목" },
  { key: "optionalSection", label: "Optional 섹션" },
  { key: "length", label: "문서 길이" },
] as const satisfies readonly { key: keyof LlmsTxtChecks; label: string }[];

function Badge({ children, tone }: { children: React.ReactNode; tone: BadgeTone }) {
  const styles =
    tone === "live"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-zinc-200 bg-zinc-100 text-zinc-600";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}

function SourceLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="break-all text-xs text-blue-600 hover:underline"
    >
      {url}
    </a>
  );
}

function RobotsResult({ report }: { report: AiVisibilityDomainDiagnostic }) {
  const resource = report.robotsTxt;
  const assessment = resource.assessment;
  const blocked = assessment?.summary.blockedCount ?? 0;
  const tone: BadgeTone =
    resource.status === "error"
      ? "danger"
      : assessment?.summary.fullyBlocked
        ? "danger"
        : blocked > 0
          ? "warn"
          : "live";
  const label =
    resource.status === "error"
      ? "확인 실패"
      : resource.status === "not-found"
        ? "파일 없음 · 기본 허용"
        : assessment?.summary.fullyBlocked
          ? "AI 크롤러 전체 차단"
          : blocked > 0
            ? `${blocked}개 크롤러 차단`
            : "AI 크롤러 허용";

  return (
    <article className={PANEL}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">robots.txt</p>
          <h3 className="mt-1 text-base font-semibold text-zinc-900">AI 크롤러 접근</h3>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>

      <div className="mt-3">
        <SourceLink url={resource.finalUrl} />
      </div>

      {resource.status === "error" ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {resource.error ?? "robots.txt를 가져오지 못했습니다."}
        </p>
      ) : assessment ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-zinc-50 p-3 text-center">
            <div>
              <p className="text-lg font-semibold text-zinc-900">{assessment.summary.totalCount}</p>
              <p className="text-[11px] text-zinc-500">대상</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-emerald-700">{assessment.summary.allowedCount}</p>
              <p className="text-[11px] text-zinc-500">허용</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-red-700">{assessment.summary.blockedCount}</p>
              <p className="text-[11px] text-zinc-500">차단</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">{assessment.reason}</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="AI 크롤러별 접근 상태">
            {assessment.crawlers.map((crawler) => (
              <li
                key={crawler.token}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-zinc-800">{crawler.token}</span>
                  <span className="block text-[11px] text-zinc-400">{crawler.vendor}</span>
                </span>
                <Badge tone={crawler.allowed ? "live" : "danger"}>
                  {crawler.allowed ? "허용" : "차단"}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}

function LlmsResult({ report }: { report: AiVisibilityDomainDiagnostic }) {
  const resource = report.llmsTxt;
  const assessment = resource.assessment;
  const tone: BadgeTone =
    resource.status === "error"
      ? "danger"
      : resource.status === "not-found"
        ? "muted"
        : assessment?.isLlmsTxt
          ? assessment.score >= 80
            ? "live"
            : "warn"
          : "danger";
  const label =
    resource.status === "error"
      ? "확인 실패"
      : resource.status === "not-found"
        ? "파일 없음"
        : assessment?.isLlmsTxt
          ? `${assessment.grade} 등급`
          : "유효하지 않은 문서";

  return (
    <article className={PANEL}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">llms.txt</p>
          <h3 className="mt-1 text-base font-semibold text-zinc-900">LLM 문서 품질</h3>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>

      <div className="mt-3">
        <SourceLink url={resource.finalUrl} />
      </div>

      {resource.status === "error" ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {resource.error ?? "llms.txt를 가져오지 못했습니다."}
        </p>
      ) : resource.status === "not-found" ? (
        <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-3 text-sm leading-6 text-zinc-600">
          공개된 llms.txt가 없습니다. 이 파일은 선택 사항이며, 게시하면 LLM이 핵심 문서와 공식 링크를 더 쉽게 찾을 수 있습니다.
        </p>
      ) : assessment ? (
        <>
          <div className="mt-4 flex items-end gap-2 rounded-lg bg-zinc-50 p-3">
            <span className="text-3xl font-semibold text-zinc-900">{assessment.score}</span>
            <span className="pb-1 text-sm text-zinc-500">/ 100 · {assessment.grade} 등급</span>
          </div>
          {assessment.invalidReason && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {assessment.invalidReason}
            </p>
          )}
          <ul className="mt-4 space-y-2" aria-label="llms.txt 품질 검사">
            {LLMS_CHECK_LABELS.map(({ key, label: checkLabel }) => {
              const check = assessment.checks[key];
              const optional = key === "optionalSection";
              const checkTone: BadgeTone = check.passed
                ? "live"
                : optional
                  ? "muted"
                  : check.status === "warning"
                    ? "warn"
                    : "danger";
              return (
                <li key={key} className="rounded-lg border border-zinc-100 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-800">{checkLabel}</span>
                    <Badge tone={checkTone}>
                      {check.passed ? "통과" : optional ? "선택" : check.status === "warning" ? "경고" : "실패"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-zinc-500">{check.reason}</p>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </article>
  );
}

export function AiDomainDiagnosticsPanel({
  domain,
  report,
  loading,
  error,
  onRefresh,
}: {
  domain: string;
  report: AiVisibilityDomainDiagnostic | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <section className="mb-6" aria-labelledby="ai-domain-diagnostics-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ai-domain-diagnostics-title" className="text-base font-semibold text-zinc-900">
            AI 검색 접근성 진단
          </h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            {domain}의 공개 파일을 직접 확인합니다. 외부 API 키나 유료 크레딧은 사용하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
        >
          {loading ? "확인 중…" : "다시 확인"}
        </button>
      </div>

      <div aria-live="polite">
        {error && (
          <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {loading && !report && (
          <div role="status" className={`${PANEL} text-sm text-zinc-500`}>
            robots.txt와 llms.txt를 안전하게 확인하고 있습니다…
          </div>
        )}
        {report && (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
              <span>확인 시각: {new Date(report.checkedAt).toLocaleString("ko-KR")}</span>
              {loading && <span>새 결과 확인 중…</span>}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <RobotsResult report={report} />
              <LlmsResult report={report} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
