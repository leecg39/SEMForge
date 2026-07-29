import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { linkGraphEdges } from "@/db/schema";
import { clampScore, normalizeDomain } from "@/lib/analytics/metrics";
import { newId } from "@/lib/ids";
import { registrableDomain, type CrawledPage } from "@/server/siteaudit/crawl";

/**
 * Site Audit 크롤 결과의 외부 링크를 원천 3(link_graph_edges)에 적재한다.
 *
 * 크롤한 사이트 A 가 B 로 링크하면 A→B 엣지가 쌓이고, 이는 B 의 도메인 개요
 * 백링크·참조 도메인·Authority Score 입력이 된다. 감사를 돌릴수록 링크
 * 그래프가 시드 데이터가 아닌 실측 엣지로 채워지는 구조다.
 *
 *   - (sourceUrl, targetUrl) 유니크 제약에 upsert: 재크롤 시 lastSeenAt 갱신,
 *     firstSeenAt 은 최초 관측 시각을 보존한다.
 *   - sourceNetwork: "crawl:<등록 도메인>" — 같은 사이트에서 나온 엣지를 한
 *     네트워크로 묶어 기존 네트워크 집중도(스팸 신호) 계산과 호환시킨다.
 *   - sourceAuthority: 크롤 시점 소스 품질 피처(0~100). 실제 서비스의 크롤러
 *     품질 점수 대신, 같은 실행에서 계산한 Site Health 를 대리 지표로 쓴다.
 */

export const CRAWL_LINK_SOURCE = "site-audit-crawler";
/** 한 번의 감사 실행이 적재할 수 있는 엣지 상한 (링크 팜 방어). */
const MAX_EDGES_PER_RUN = 2_000;
/** SQLite 바인딩 변수 한도를 고려한 배치 크기 (11 컬럼 × 80 행 < 999). */
const CHUNK_SIZE = 80;

export interface LinkGraphPersistStats {
  /** 적재(신규+갱신)한 엣지 수 */
  edges: number;
  /** 엣지가 향한 고유 대상 도메인 수 */
  targetDomains: number;
}

export async function persistCrawlLinkEdges(input: {
  pages: readonly CrawledPage[];
  /** 크롤 시점 소스 품질 피처 (0~100, Site Health). */
  sourceAuthority: number;
  capturedAt: Date;
}): Promise<LinkGraphPersistStats> {
  type EdgeRow = typeof linkGraphEdges.$inferInsert;

  const rows = new Map<string, EdgeRow>();
  const targetDomains = new Set<string>();
  const sourceAuthority = Math.round(clampScore(input.sourceAuthority));

  for (const page of input.pages) {
    if (rows.size >= MAX_EDGES_PER_RUN) break;
    if (!page.isHtml || page.status === 0 || page.status >= 400) continue;

    let sourceHost = "";
    try {
      sourceHost = new URL(page.url).hostname.toLowerCase();
    } catch {
      continue;
    }
    const sourceDomain = normalizeDomain(page.url);
    if (!sourceDomain) continue;
    const sourceNetwork = `crawl:${registrableDomain(sourceHost)}`;

    for (const link of page.externalLinks) {
      if (rows.size >= MAX_EDGES_PER_RUN) break;
      const targetDomain = normalizeDomain(link.url);
      if (!targetDomain || !targetDomain.includes(".")) continue;

      const key = `${page.url}\u0000${link.url}`;
      if (rows.has(key)) continue;
      targetDomains.add(targetDomain);
      rows.set(key, {
        id: newId("lnk"),
        sourceDomain,
        targetDomain,
        sourceUrl: page.url,
        targetUrl: link.url,
        sourceNetwork,
        isFollow: link.isFollow,
        sourceAuthority,
        source: CRAWL_LINK_SOURCE,
        firstSeenAt: input.capturedAt,
        lastSeenAt: input.capturedAt,
      });
    }
  }

  const values = [...rows.values()];
  for (let offset = 0; offset < values.length; offset += CHUNK_SIZE) {
    await db
      .insert(linkGraphEdges)
      .values(values.slice(offset, offset + CHUNK_SIZE))
      .onConflictDoUpdate({
        target: [linkGraphEdges.sourceUrl, linkGraphEdges.targetUrl],
        set: {
          // 재관측: 최초 발견(firstSeenAt)은 보존하고 최신 관측 정보만 갱신한다.
          lastSeenAt: input.capturedAt,
          isFollow: sql`excluded.is_follow`,
          sourceAuthority: sql`excluded.source_authority`,
          source: sql`excluded.source`,
        },
      });
  }

  return { edges: values.length, targetDomains: targetDomains.size };
}
