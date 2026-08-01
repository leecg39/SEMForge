export interface TrafficGscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface TrafficTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
}

export interface PageMover {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
  clickShare: number;
  clickDelta: number | null;
  state: "growing" | "declining" | "new" | "stable";
}

export interface MarketPlayerInput {
  domain: string;
  appearances: number;
  avgPosition: number;
  bestPosition: number;
  tracked?: boolean;
}

export interface MarketPlayer extends MarketPlayerInput {
  presence: number;
  rankingStrength: number;
  own: boolean;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function summarizeGscRows(rows: TrafficGscRow[]): TrafficTotals {
  const clicks = rows.reduce((sum, row) => sum + finite(row.clicks), 0);
  const impressions = rows.reduce((sum, row) => sum + finite(row.impressions), 0);
  const weightedPosition = rows.reduce(
    (sum, row) => sum + finite(row.position) * finite(row.impressions),
    0,
  );
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : null,
  };
}

export function normalizeGscTarget(input: string, properties: string[] = []): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("sc-domain:") || /^https?:\/\//i.test(trimmed)) return trimmed;
  const domain = trimmed
    .toLowerCase()
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/\.$/, "");
  const matched = properties.find((property) => {
    const candidate = property
      .replace(/^sc-domain:/, "")
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      .toLowerCase();
    return candidate === domain;
  });
  return matched ?? `sc-domain:${domain}`;
}

export function previousDateRange(start: string, end: string): { start: string; end: string } {
  const startAt = new Date(`${start}T00:00:00Z`);
  const endAt = new Date(`${end}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;
  const span = Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / dayMs) + 1);
  const previousEnd = new Date(startAt.getTime() - dayMs);
  const previousStart = new Date(previousEnd.getTime() - (span - 1) * dayMs);
  return {
    start: previousStart.toISOString().slice(0, 10),
    end: previousEnd.toISOString().slice(0, 10),
  };
}

export function buildPageMovers(
  currentRows: TrafficGscRow[],
  previousRows: TrafficGscRow[],
): PageMover[] {
  const previous = new Map(previousRows.map((row) => [row.keys[0] ?? "", row]));
  const totalClicks = currentRows.reduce((sum, row) => sum + finite(row.clicks), 0);
  const current = currentRows
    .map((row) => {
      const page = row.keys[0] ?? "";
      const before = previous.get(page);
      const clickDelta = before ? finite(row.clicks) - finite(before.clicks) : null;
      const state: PageMover["state"] = !before
        ? "new"
        : clickDelta !== null && clickDelta > 0
          ? "growing"
          : clickDelta !== null && clickDelta < 0
            ? "declining"
            : "stable";
      return {
        page,
        clicks: finite(row.clicks),
        impressions: finite(row.impressions),
        ctr: finite(row.ctr),
        position: Number.isFinite(row.position) ? row.position : null,
        clickShare: totalClicks > 0 ? (finite(row.clicks) / totalClicks) * 100 : 0,
        clickDelta,
        state,
      };
    });
  const currentPages = new Set(currentRows.map((row) => row.keys[0] ?? ""));
  const dropped = previousRows
    .filter((row) => {
      const page = row.keys[0] ?? "";
      return page && !currentPages.has(page) && finite(row.clicks) > 0;
    })
    .map((row): PageMover => ({
      page: row.keys[0] ?? "",
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: null,
      clickShare: 0,
      clickDelta: -finite(row.clicks),
      state: "declining",
    }));
  return [...current, ...dropped]
    .filter((row) => row.page)
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

export function buildMarketPlayers(input: {
  ownDomain: string;
  ownAppearances: number;
  ownAvgPosition: number | null;
  keywordsWithSerp: number;
  competitors: MarketPlayerInput[];
}): MarketPlayer[] {
  const denominator = Math.max(1, input.keywordsWithSerp);
  const rows: Array<MarketPlayerInput & { own: boolean }> = [
    {
      domain: input.ownDomain,
      appearances: input.ownAppearances,
      avgPosition: input.ownAvgPosition ?? 100,
      bestPosition: input.ownAvgPosition ?? 100,
      tracked: true,
      own: true,
    },
    ...input.competitors.map((row) => ({ ...row, own: false })),
  ];
  return rows
    .map((row) => ({
      ...row,
      presence: Math.min(100, Math.round((row.appearances / denominator) * 1000) / 10),
      rankingStrength: Math.max(0, Math.round((101 - row.avgPosition) * 10) / 10),
    }))
    .sort((a, b) => b.presence - a.presence || a.avgPosition - b.avgPosition);
}
