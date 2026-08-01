"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import {
  formatGapTargetParam,
  type GapCategory,
  type GapKeywordRow,
  type KeywordGapReport,
} from "@/lib/analytics/keyword-gap";
import type { AnalyticsIntent } from "@/lib/analytics/types";
import { INTENT_META } from "../domain-overview/copy";
import { IntentBadge, LivePill } from "../domain-overview/primitives";
import {
  OrganicCard,
  OrganicEmptyState,
  OrganicLink,
  OrganicSegmented,
  OrganicTable,
  OrganicTd,
  OrganicTh,
  OrganicTr,
  ORGANIC_COLORS,
} from "../organic/organic-ui";
import {
  COPY,
  GAP_TAB_ORDER,
  KEYWORD_OVERVIEW_HREF,
  kdColor,
  positionColor,
  TARGET_COLORS,
  YOU_COLUMN_BG,
} from "./copy";
import { OverlapVenn } from "./OverlapVenn";
import { pushRecentGap } from "./recent";
import { GapTargetForm } from "./TargetForm";

type GapTab = GapCategory | "all";
type SortKey = "keyword" | "volume" | "kd" | "cpc" | `pos${number}`;

const PAGE_SIZES = [25, 50, 100] as const;

const POSITION_BANDS: Record<string, [number, number]> = {
  "1-3": [1, 3],
  "4-10": [4, 10],
  "11-20": [11, 20],
  "21-50": [21, 50],
  "51-100": [51, 100],
};

const VOLUME_BANDS: Record<string, [number, number]> = {
  "0-10": [0, 10],
  "11-100": [11, 100],
  "101-1000": [101, 1_000],
  "1001-10000": [1_001, 10_000],
  "10001+": [10_001, Number.POSITIVE_INFINITY],
};

const KD_BANDS: Record<string, [number, number]> = {
  "0-14": [0, 14],
  "15-29": [15, 29],
  "30-49": [30, 49],
  "50-69": [50, 69],
  "70-84": [70, 84],
  "85-100": [85, 100],
};

function formatCpc(cpcCents: number): string {
  return cpcCents > 0 ? `$${(cpcCents / 100).toFixed(2)}` : "—";
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 정렬 비교 — 포지션 null(순위 없음)은 방향과 무관하게 항상 마지막. */
function compareRows(a: GapKeywordRow, b: GapKeywordRow, key: SortKey, dir: 1 | -1): number {
  if (key === "keyword") return a.keyword.localeCompare(b.keyword) * dir;
  if (key === "volume") return (a.volume - b.volume) * dir;
  if (key === "kd") return (a.difficulty - b.difficulty) * dir;
  if (key === "cpc") return (a.cpcCents - b.cpcCents) * dir;
  const index = Number(key.slice(3));
  const left = a.positions[index];
  const right = b.positions[index];
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * dir;
}

export function KeywordGapDashboard({ initialReport }: { initialReport: KeywordGapReport }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const report = initialReport;
  const numberFormat = useMemo(
    () => new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US"),
    [locale],
  );

  // 성공적으로 만들어진 비교 조합을 "최근 비교"에 남긴다.
  useEffect(() => {
    pushRecentGap({
      targets: report.query.targets.map(formatGapTargetParam),
      country: report.query.countryCode,
    });
  }, [report]);

  const [tab, setTab] = useState<GapTab>(() =>
    report.counts.shared > 0 ? "shared" : "all",
  );
  const [oppTab, setOppTab] = useState<GapCategory>("missing");
  const [search, setSearch] = useState("");
  const [posTarget, setPosTarget] = useState(0);
  const [posBand, setPosBand] = useState("any");
  const [volumeBand, setVolumeBand] = useState("any");
  const [kdBand, setKdBand] = useState("any");
  const [intents, setIntents] = useState<ReadonlySet<AnalyticsIntent>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "volume", dir: -1 });
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return report.rows.filter((row) => {
      if (tab !== "all" && !row.categories.includes(tab)) return false;
      if (query && !row.keyword.toLowerCase().includes(query)) return false;
      if (posBand !== "any") {
        const position = row.positions[posTarget];
        const range = POSITION_BANDS[posBand];
        if (position === null || position < range[0] || position > range[1]) return false;
      }
      if (volumeBand !== "any") {
        const range = VOLUME_BANDS[volumeBand];
        if (row.volume < range[0] || row.volume > range[1]) return false;
      }
      if (kdBand !== "any") {
        const range = KD_BANDS[kdBand];
        if (row.difficulty < range[0] || row.difficulty > range[1]) return false;
      }
      if (intents.size > 0 && !intents.has(row.intent)) return false;
      return true;
    });
  }, [report.rows, tab, search, posTarget, posBand, volumeBand, kdBand, intents]);

  const sorted = useMemo(
    () => filtered.toSorted((a, b) => compareRows(a, b, sort.key, sort.dir)),
    [filtered, sort],
  );

  useEffect(() => {
    setPage(0);
  }, [tab, search, posTarget, posBand, volumeBand, kdBand, intents, pageSize]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 1 ? -1 : 1 }
        : { key, dir: key === "keyword" || key.startsWith("pos") ? 1 : -1 },
    );
  };

  const hasFilters =
    search.trim() !== "" ||
    posBand !== "any" ||
    volumeBand !== "any" ||
    kdBand !== "any" ||
    intents.size > 0;

  const clearFilters = () => {
    setSearch("");
    setPosTarget(0);
    setPosBand("any");
    setVolumeBand("any");
    setKdBand("any");
    setIntents(new Set());
  };

  const exportCsv = () => {
    const labels = report.targets.map((target) => target.label);
    const header = [
      copy.keywordHeader,
      copy.intentHeader,
      ...labels,
      copy.volumeHeader,
      copy.kdHeader,
      copy.cpcHeader,
      copy.updatedHeader,
    ];
    const lines = sorted.map((row) =>
      [
        csvCell(row.keyword),
        row.intent,
        ...row.positions.map((position) => position ?? ""),
        row.volume,
        row.difficulty,
        row.cpcCents > 0 ? (row.cpcCents / 100).toFixed(2) : "",
        row.capturedAt?.slice(0, 10) ?? "",
      ].join(","),
    );
    const blob = new Blob(["\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `keyword-gap-${labels[0] ?? "report"}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const opportunityRows = useMemo(
    () => report.rows.filter((row) => row.categories.includes(oppTab)).slice(0, 5),
    [report.rows, oppTab],
  );

  const youLabel = report.targets[0]?.label ?? "";
  const lastCollected = report.universe.lastCapturedAt?.slice(0, 10) ?? "—";
  const emptyUniverse = report.universe.keywordCount === 0;

  return (
    <div className="mx-auto w-full max-w-[1140px] p-4 sm:p-6">
      {/* 헤더 */}
      <p className="text-[12px] text-a2-text-muted">
        {copy.breadcrumbSeo} › {copy.breadcrumbSection} › {copy.title}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-[22px] font-bold leading-8 tracking-[-0.3px] text-a2-text">
          {copy.title}: <span className="text-a2-text">{youLabel}</span>
        </h1>
        <button
          type="button"
          onClick={exportCsv}
          disabled={report.rows.length === 0}
          className="h-8 shrink-0 rounded-[6px] border border-app-border bg-white px-3 text-[13px] font-medium text-a2-text transition-colors hover:bg-black/5 disabled:opacity-50"
        >
          {copy.exportCsv}
        </button>
      </div>

      {/* 대상 편집 + 재비교 */}
      <div className="mt-4 rounded-[10px] border border-app-border bg-a2-card p-4 shadow-[var(--a2-card-shadow)]">
        <GapTargetForm
          copy={copy}
          variant="report"
          initialTargets={report.query.targets}
          initialCountry={report.query.countryCode}
        />
        <p className="mt-3 flex flex-wrap items-center gap-2 border-t border-app-border pt-3 text-[12px] text-a2-text-muted">
          <LivePill label={copy.liveTag} />
          <span>
            {copy.universeSummary(
              numberFormat.format(report.universe.keywordCount),
              numberFormat.format(report.counts.all),
            )}
            {" · "}
            {copy.lastCollected} {lastCollected}
          </span>
          <span
            title={copy.universeHint}
            className="cursor-help underline decoration-dotted underline-offset-4"
          >
            ⓘ
          </span>
        </p>
      </div>

      {emptyUniverse ? (
        <div className="mt-4">
          <OrganicCard wide>
            <OrganicEmptyState title={copy.noUniverseTitle} hint={copy.noUniverseHint} />
            <p className="pb-2 text-center">
              <OrganicLink href={KEYWORD_OVERVIEW_HREF}>{copy.openKeyword} →</OrganicLink>
            </p>
          </OrganicCard>
        </div>
      ) : (
        <>
          {/* 상위 기회 + 키워드 겹침 */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            <OrganicCard
              title={copy.topOpportunities}
              titleExtra={
                <OrganicSegmented
                  size="s"
                  ariaLabel={copy.topOpportunities}
                  options={(["missing", "weak", "untapped"] as const).map((category) => ({
                    value: category,
                    label: copy.tabLabels[category],
                  }))}
                  value={oppTab}
                  onChange={setOppTab}
                />
              }
            >
              {opportunityRows.length === 0 ? (
                <OrganicEmptyState
                  title={copy.opportunityEmptyTitle}
                  hint={copy.opportunityEmptyHint}
                />
              ) : (
                <ul className="flex flex-col">
                  {opportunityRows.map((row) => (
                    <li
                      key={row.keyword}
                      className="flex items-center gap-2 border-b py-2 last:border-b-0"
                      style={{ borderColor: ORGANIC_COLORS.divider }}
                    >
                      <OrganicLink
                        href={`${KEYWORD_OVERVIEW_HREF}?keyword=${encodeURIComponent(row.keyword)}`}
                        className="min-w-0 flex-1 truncate"
                        title={copy.openKeyword}
                      >
                        {row.keyword}
                      </OrganicLink>
                      <span className="shrink-0 text-[13px] tabular-nums text-a2-text">
                        {numberFormat.format(row.volume)}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[13px] tabular-nums text-a2-text">
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: kdColor(row.difficulty) }}
                        />
                        {row.difficulty}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </OrganicCard>

            <OrganicCard
              title={copy.keywordOverlap}
              titleExtra={
                <span className="text-[11px] text-a2-text-muted">{copy.overlapHint}</span>
              }
            >
              <OverlapVenn report={report} copy={copy} numberFormat={numberFormat} />
            </OrganicCard>
          </div>

          {/* 키워드 세부 정보 */}
          <div className="mt-4">
            <OrganicCard wide title={copy.keywordDetails}>
              {/* 카테고리 탭 */}
              <div className="overflow-x-auto pb-1">
                <OrganicSegmented
                  ariaLabel={copy.keywordDetails}
                  options={GAP_TAB_ORDER.map((category) => ({
                    value: category,
                    label: (
                      <>
                        {copy.tabLabels[category]}
                        <b className="tabular-nums">
                          {numberFormat.format(report.counts[category])}
                        </b>
                      </>
                    ),
                  }))}
                  value={tab}
                  onChange={setTab}
                />
              </div>

              {/* 필터 바 */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  aria-label={copy.searchPlaceholder}
                  className="h-8 w-[200px] rounded-[6px] border border-app-border bg-white px-2.5 text-[13px] text-a2-text outline-none transition-colors focus:border-app-blue"
                />
                <label className="flex items-center gap-1 text-[12px] text-a2-text-muted">
                  {copy.positionFilter}
                  <select
                    value={posTarget}
                    onChange={(event) => setPosTarget(Number(event.target.value))}
                    aria-label={`${copy.positionFilter} ${copy.positionTarget}`}
                    className="h-8 max-w-[160px] rounded-[6px] border border-app-border bg-white px-1.5 text-[12px] text-a2-text outline-none focus:border-app-blue"
                  >
                    {report.targets.map((target, index) => (
                      <option key={index} value={index}>
                        {target.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={posBand}
                    onChange={(event) => setPosBand(event.target.value)}
                    aria-label={copy.positionFilter}
                    className="h-8 rounded-[6px] border border-app-border bg-white px-1.5 text-[12px] text-a2-text outline-none focus:border-app-blue"
                  >
                    <option value="any">{copy.positionAny}</option>
                    {Object.keys(POSITION_BANDS).map((band) => (
                      <option key={band} value={band}>
                        {band}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-[12px] text-a2-text-muted">
                  {copy.volumeFilter}
                  <select
                    value={volumeBand}
                    onChange={(event) => setVolumeBand(event.target.value)}
                    aria-label={copy.volumeFilter}
                    className="h-8 rounded-[6px] border border-app-border bg-white px-1.5 text-[12px] text-a2-text outline-none focus:border-app-blue"
                  >
                    <option value="any">{copy.anyOption}</option>
                    {Object.keys(VOLUME_BANDS).map((band) => (
                      <option key={band} value={band}>
                        {band}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-[12px] text-a2-text-muted">
                  {copy.kdFilter}
                  <select
                    value={kdBand}
                    onChange={(event) => setKdBand(event.target.value)}
                    aria-label={copy.kdFilter}
                    className="h-8 rounded-[6px] border border-app-border bg-white px-1.5 text-[12px] text-a2-text outline-none focus:border-app-blue"
                  >
                    <option value="any">{copy.anyOption}</option>
                    {Object.keys(KD_BANDS).map((band) => (
                      <option key={band} value={band}>
                        {band}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="flex items-center gap-1 text-[12px] text-a2-text-muted">
                  {copy.intentFilter}
                  {(Object.keys(INTENT_META) as AnalyticsIntent[]).map((intent) => {
                    const meta = INTENT_META[intent];
                    const active = intents.has(intent);
                    return (
                      <button
                        key={intent}
                        type="button"
                        aria-pressed={active}
                        title={meta.label[locale]}
                        onClick={() =>
                          setIntents((current) => {
                            const next = new Set(current);
                            if (next.has(intent)) next.delete(intent);
                            else next.add(intent);
                            return next;
                          })
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-[6px] border text-[12px] font-semibold transition-colors"
                        style={{
                          color: meta.color,
                          backgroundColor: active ? meta.bg : "#fff",
                          borderColor: active ? meta.color : ORGANIC_COLORS.border,
                        }}
                      >
                        {meta.short}
                      </button>
                    );
                  })}
                </span>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-[12px] font-medium text-app-blue hover:underline"
                  >
                    {copy.clearFilters}
                  </button>
                )}
              </div>

              {/* 테이블 */}
              <div className="mt-3 overflow-x-auto">
                {pageRows.length === 0 ? (
                  <OrganicEmptyState title={copy.noRows} hint={copy.universeHint} />
                ) : (
                  <OrganicTable>
                    <thead>
                      <tr>
                        <OrganicTh sortable>
                          <button type="button" onClick={() => toggleSort("keyword")}>
                            {copy.keywordHeader}
                          </button>
                        </OrganicTh>
                        <OrganicTh>
                          <span title={copy.intentModelNote}>{copy.intentHeader}</span>
                        </OrganicTh>
                        {report.targets.map((target, index) => (
                          <OrganicTh key={index} align="right" sortable>
                            <button
                              type="button"
                              onClick={() => toggleSort(`pos${index}`)}
                              className="inline-flex max-w-[150px] items-center gap-1"
                              title={target.label}
                            >
                              <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: TARGET_COLORS[index] }}
                              />
                              <span className="truncate">{target.label}</span>
                            </button>
                          </OrganicTh>
                        ))}
                        <OrganicTh align="right" sortable>
                          <button type="button" onClick={() => toggleSort("volume")}>
                            {copy.volumeHeader}
                          </button>
                        </OrganicTh>
                        <OrganicTh align="right" sortable>
                          <button
                            type="button"
                            onClick={() => toggleSort("kd")}
                            title={copy.kdModelNote}
                          >
                            {copy.kdHeader}
                          </button>
                        </OrganicTh>
                        <OrganicTh align="right" sortable>
                          <button type="button" onClick={() => toggleSort("cpc")}>
                            {copy.cpcHeader}
                          </button>
                        </OrganicTh>
                        <OrganicTh align="right">{copy.updatedHeader}</OrganicTh>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => (
                        <OrganicTr key={row.keyword}>
                          <OrganicTd className="max-w-[260px]">
                            <OrganicLink
                              href={`${KEYWORD_OVERVIEW_HREF}?keyword=${encodeURIComponent(row.keyword)}`}
                              className="block truncate"
                              title={copy.openKeyword}
                            >
                              {row.keyword}
                            </OrganicLink>
                          </OrganicTd>
                          <OrganicTd>
                            <IntentBadge intent={row.intent} />
                          </OrganicTd>
                          {row.positions.map((position, index) => (
                            <OrganicTd
                              key={index}
                              align="right"
                              className="px-2 tabular-nums"
                            >
                              <span
                                className="inline-block w-full rounded-[4px] px-1.5 py-0.5"
                                style={index === 0 ? { backgroundColor: YOU_COLUMN_BG } : undefined}
                                title={row.urls[index] ?? undefined}
                              >
                                {position === null ? (
                                  <span style={{ color: ORGANIC_COLORS.textSecondary }}>—</span>
                                ) : (
                                  <span
                                    className="font-semibold"
                                    style={{ color: positionColor(position) }}
                                  >
                                    {position}
                                  </span>
                                )}
                              </span>
                            </OrganicTd>
                          ))}
                          <OrganicTd align="right" className="tabular-nums">
                            {numberFormat.format(row.volume)}
                          </OrganicTd>
                          <OrganicTd align="right" className="tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <span
                                aria-hidden
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: kdColor(row.difficulty) }}
                              />
                              {row.difficulty}
                            </span>
                          </OrganicTd>
                          <OrganicTd align="right" className="tabular-nums">
                            {formatCpc(row.cpcCents)}
                          </OrganicTd>
                          <OrganicTd
                            align="right"
                            className="tabular-nums"
                          >
                            <span style={{ color: ORGANIC_COLORS.textSecondary }}>
                              {row.capturedAt?.slice(0, 10) ?? "—"}
                            </span>
                          </OrganicTd>
                        </OrganicTr>
                      ))}
                    </tbody>
                  </OrganicTable>
                )}
              </div>

              {/* 페이지네이션 */}
              {sorted.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-a2-text-muted">
                  <label className="flex items-center gap-1">
                    {copy.rowsPerPage}
                    <select
                      value={pageSize}
                      onChange={(event) => setPageSize(Number(event.target.value))}
                      aria-label={copy.rowsPerPage}
                      className="h-7 rounded-[6px] border border-app-border bg-white px-1.5 text-[12px] text-a2-text outline-none focus:border-app-blue"
                    >
                      {PAGE_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">
                      {safePage * pageSize + 1}–{Math.min(sorted.length, (safePage + 1) * pageSize)}
                      {" / "}
                      {numberFormat.format(sorted.length)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(0, current - 1))}
                      disabled={safePage === 0}
                      className="h-7 rounded-[6px] border border-app-border bg-white px-2 transition-colors hover:bg-black/5 disabled:opacity-50"
                    >
                      {copy.pagePrev}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                      disabled={safePage >= pageCount - 1}
                      className="h-7 rounded-[6px] border border-app-border bg-white px-2 transition-colors hover:bg-black/5 disabled:opacity-50"
                    >
                      {copy.pageNext}
                    </button>
                  </div>
                </div>
              )}
            </OrganicCard>
          </div>
        </>
      )}
    </div>
  );
}
