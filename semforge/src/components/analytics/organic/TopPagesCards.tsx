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
 * 상위 페이지 / 상위 서브도메인 카드 (Organic Research 534px 열).
 * 명세: docs/research/components/top-pages-subdomains.spec.md
 * 크롭: docs/design-references/semrush-organic/10-top-pages.png, 11-top-subdomains.png
 */

export interface TopPageRow {
  /** 표시 문자열 (프로토콜 제거된 URL/서브도메인) */
  display: string;
  href: string;
  /** 부모가 계산한 문자열 그대로 표시 (`77.61`, `< 0.01`) */
  trafficPct: string;
  keywords: number;
}

interface TopPagesCardProps {
  rows: TopPageRow[];
  totalCount: number;
  viewAllHref: string;
  copy: {
    title: string;
    headers: { url: string; traffic: string; keywords: string };
    viewAll: (n: number) => string;
    empty: string;
  };
}

const MAX_ROWS = 5;
const MAX_DISPLAY_CHARS = 34;
const HEAD_CHARS = 18;
const TAIL_CHARS = 12;

/** 긴 표시 문자열 가운데 생략 — CSS로는 불가능해 JS로 head…tail 조합 */
function truncateMiddle(value: string): string {
  if (value.length <= MAX_DISPLAY_CHARS) return value;
  return `${value.slice(0, HEAD_CHARS)}.....${value.slice(-TAIL_CHARS)}`;
}

/** 외부링크 아이콘 — 원본 에셋을 복사하지 않은 오리지널 SVG(사각 + ↗ 화살표). 링크 색 상속 */
function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
      <path
        d="M11.5 8v2.5A1.5 1.5 0 0 1 10 12H3.5A1.5 1.5 0 0 1 2 10.5V4a1.5 1.5 0 0 1 1.5-1.5H6"
        stroke="currentColor"
        strokeLinecap="round"
      />
      <path d="M8.5 2H12v3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 2 6.75 7.25" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

/** 두 카드 공용 렌더러 — copy 만 다르고 구조는 동일 */
function UrlListCard({ rows, totalCount, viewAllHref, copy }: TopPagesCardProps) {
  const visible = rows.slice(0, MAX_ROWS);

  return (
    <OrganicCard title={copy.title}>
      {visible.length === 0 ? (
        <div
          className="flex min-h-[185px] items-center justify-center text-[12px]"
          style={{ color: ORGANIC_COLORS.textSecondary }}
        >
          {copy.empty}
        </div>
      ) : (
        <OrganicTable>
          <thead>
            <tr>
              <OrganicTh>{copy.headers.url}</OrganicTh>
              <OrganicTh align="right" sortable>
                {copy.headers.traffic}
              </OrganicTh>
              <OrganicTh align="right">{copy.headers.keywords}</OrganicTh>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <OrganicTr key={`${row.display}-${i}`}>
                <OrganicTd>
                  <OrganicLink href={row.href} external title={row.display}>
                    <span className="inline-flex items-center gap-1">
                      {truncateMiddle(row.display)}
                      <ExternalLinkIcon />
                    </span>
                  </OrganicLink>
                </OrganicTd>
                <OrganicTd align="right">{row.trafficPct}</OrganicTd>
                <OrganicTd align="right">{row.keywords}</OrganicTd>
              </OrganicTr>
            ))}
          </tbody>
        </OrganicTable>
      )}

      <div className="mt-3">
        <OrganicCta href={viewAllHref}>{copy.viewAll(totalCount)}</OrganicCta>
      </div>
    </OrganicCard>
  );
}

export function TopPagesCard(props: TopPagesCardProps) {
  return <UrlListCard {...props} />;
}

export function TopSubdomainsCard(props: TopPagesCardProps) {
  return <UrlListCard {...props} />;
}
