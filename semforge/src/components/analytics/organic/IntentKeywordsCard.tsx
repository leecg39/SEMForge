"use client";

import {
  ORGANIC_COLORS,
  OrganicCard,
  OrganicCta,
  OrganicLink,
  OrganicTable,
  OrganicTd,
  OrganicTh,
  OrganicTr,
} from "./organic-ui";

/**
 * 의도별 키워드 카드 (534px 열).
 * 계측 근거: docs/research/components/intent-keywords.spec.md,
 * docs/research/extract/intent-keywords-full.json, 크롭 05-intent-keywords.png
 * — 원본은 3개 헤더지만 % 는 의도 열 우측 서브컬럼이므로 4열 테이블(% 헤더는 빈 칸)로 구현.
 */

export interface IntentRow {
  intent: "informational" | "navigational" | "commercial" | "transactional";
  label: string;
  sharePct: number;
  keywords: number;
  traffic: number | null;
  href?: string;
}

const formatInt = (n: number) => Math.round(n).toLocaleString("en-US");

export function IntentKeywordsCard({
  rows,
  viewAllHref,
  copy,
}: {
  rows: IntentRow[];
  viewAllHref: string;
  copy: {
    title: string;
    headers: { intent: string; keywords: string; traffic: string };
    noMore: string;
    viewAll: string;
    empty: string;
  };
}) {
  const shown = rows.slice(0, 4);

  if (shown.length === 0) {
    return (
      <OrganicCard title={copy.title}>
        <div className="flex min-h-[200px] items-center justify-center">
          <p className="text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
            {copy.empty}
          </p>
        </div>
      </OrganicCard>
    );
  }

  return (
    <OrganicCard title={copy.title}>
      {/* 분포 바 — 세그먼트 폭은 sharePct 비율(flex-grow), 원본 계측상 세그먼트 간 1px 간격 */}
      <div aria-hidden className="flex h-4 w-full items-stretch gap-px">
        {shown.map((row, i) => (
          <div
            key={row.intent}
            className="min-w-[4px]"
            style={{
              flex: `${row.sharePct} 1 0%`,
              backgroundColor: ORGANIC_COLORS.intent[row.intent],
              borderRadius:
                shown.length === 1
                  ? "2px"
                  : i === 0
                    ? "2px 0 0 2px"
                    : i === shown.length - 1
                      ? "0 2px 2px 0"
                      : "0",
            }}
          />
        ))}
      </div>

      <OrganicTable className="mt-3">
        <thead>
          <tr>
            <OrganicTh>{copy.headers.intent}</OrganicTh>
            <OrganicTh align="right" className="w-[64px]" />
            <OrganicTh align="right" className="w-[92px]">
              {copy.headers.keywords}
            </OrganicTh>
            <OrganicTh align="right" sortable className="w-[92px]">
              {copy.headers.traffic}
            </OrganicTh>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <OrganicTr key={row.intent}>
              <OrganicTd>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: ORGANIC_COLORS.intent[row.intent] }}
                  />
                  {row.label}
                </span>
              </OrganicTd>
              <OrganicTd align="right">
                {row.href ? (
                  <OrganicLink href={row.href}>{row.sharePct}%</OrganicLink>
                ) : (
                  <span className="text-[14px]" style={{ color: ORGANIC_COLORS.link }}>
                    {row.sharePct}%
                  </span>
                )}
              </OrganicTd>
              <OrganicTd align="right">{formatInt(row.keywords)}</OrganicTd>
              <OrganicTd align="right">
                {row.traffic === null ? "—" : formatInt(row.traffic)}
              </OrganicTd>
            </OrganicTr>
          ))}
        </tbody>
      </OrganicTable>

      {shown.length < 4 && (
        <div className="flex items-center justify-center py-4">
          <span className="text-[12px]" style={{ color: ORGANIC_COLORS.textSecondary }}>
            {copy.noMore}
          </span>
        </div>
      )}

      <div className="mt-4">
        <OrganicCta href={viewAllHref}>{copy.viewAll}</OrganicCta>
      </div>
    </OrganicCard>
  );
}
