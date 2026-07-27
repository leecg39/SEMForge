import type { Kpi, SeriesPoint, TableColumn, TableRow } from "@/types/app";

/** 시드 문자열 기반 결정적 의사난수 (페이지마다 다른, 일관된 목데이터). */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function makeSeries(seed: string, points = 12, base = 1000, dual = true): SeriesPoint[] {
  const rnd = seeded(seed);
  let a = base * (0.5 + rnd());
  let b = base * (0.4 + rnd());
  return Array.from({ length: points }, (_, i) => {
    a = Math.max(0, a * (0.9 + rnd() * 0.3));
    b = Math.max(0, b * (0.9 + rnd() * 0.3));
    return { label: MONTHS[i % 12], a: Math.round(a), ...(dual ? { b: Math.round(b) } : {}) };
  });
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

export function makeKpis(seed: string, labels: string[]): Kpi[] {
  const rnd = seeded(seed);
  return labels.map((label) => {
    const v = rnd() * 900000 + 1000;
    const d = (rnd() * 40 - 15).toFixed(1);
    const num = Number(d);
    return {
      label,
      value: fmt(v),
      delta: `${num >= 0 ? "+" : ""}${d}%`,
      trend: num > 1 ? "up" : num < -1 ? "down" : "flat",
    };
  });
}

/** 재사용 테이블 컬럼 프리셋 */
export const columnPresets: Record<string, TableColumn[]> = {
  keywords: [
    { key: "keyword", label: "Keyword" },
    { key: "intent", label: "Intent" },
    { key: "volume", label: "Volume", align: "right" },
    { key: "kd", label: "KD %", align: "right" },
    { key: "cpc", label: "CPC", align: "right" },
    { key: "pos", label: "Pos", align: "right" },
  ],
  backlinks: [
    { key: "source", label: "Source page" },
    { key: "anchor", label: "Anchor" },
    { key: "as", label: "AS", align: "right" },
    { key: "type", label: "Type" },
    { key: "first", label: "First seen" },
  ],
  pages: [
    { key: "url", label: "URL" },
    { key: "traffic", label: "Traffic", align: "right" },
    { key: "keywords", label: "Keywords", align: "right" },
    { key: "share", label: "Share", align: "right" },
  ],
  domains: [
    { key: "domain", label: "Domain" },
    { key: "as", label: "Authority", align: "right" },
    { key: "common", label: "Common", align: "right" },
    { key: "traffic", label: "Traffic", align: "right" },
  ],
  traffic: [
    { key: "source", label: "Source" },
    { key: "visits", label: "Visits", align: "right" },
    { key: "share", label: "Share", align: "right" },
    { key: "change", label: "Change", align: "right" },
  ],
};

const SAMPLE = {
  keywords: ["marketing platform", "seo tools", "keyword research", "ai search", "content optimizer", "rank tracker", "backlink checker", "local seo", "site audit", "competitor analysis"],
  intents: ["Informational", "Commercial", "Transactional", "Navigational"],
  domains: ["northwind.example", "acme.example", "globex.example", "initech.example", "umbrella.example", "hooli.example", "contoso.example"],
  sources: ["Direct", "Organic Search", "Paid Search", "Referral", "Social", "Email", "Display"],
  types: ["text", "image", "form", "frame"],
};

export function makeRows(seed: string, preset: keyof typeof columnPresets, n = 10): TableRow[] {
  const rnd = seeded(seed + preset);
  return Array.from({ length: n }, (_, i): TableRow => {
    switch (preset) {
      case "keywords":
        return {
          keyword: SAMPLE.keywords[i % SAMPLE.keywords.length],
          intent: SAMPLE.intents[Math.floor(rnd() * 4)],
          volume: fmt(rnd() * 90000 + 100),
          kd: (rnd() * 100).toFixed(0),
          cpc: "$" + (rnd() * 12).toFixed(2),
          pos: Math.ceil(rnd() * 50),
        };
      case "backlinks":
        return {
          source: SAMPLE.domains[i % SAMPLE.domains.length] + "/page-" + (i + 1),
          anchor: SAMPLE.keywords[i % SAMPLE.keywords.length],
          as: Math.ceil(rnd() * 100),
          type: SAMPLE.types[Math.floor(rnd() * 4)],
          first: "2026-0" + ((i % 9) + 1) + "-1" + (i % 9),
        };
      case "pages":
        return {
          url: "/page/" + SAMPLE.keywords[i % SAMPLE.keywords.length].replace(/\s+/g, "-"),
          traffic: fmt(rnd() * 50000 + 100),
          keywords: fmt(rnd() * 3000 + 10),
          share: (rnd() * 20).toFixed(1) + "%",
        };
      case "domains":
        return {
          domain: SAMPLE.domains[i % SAMPLE.domains.length],
          as: Math.ceil(rnd() * 100),
          common: fmt(rnd() * 5000),
          traffic: fmt(rnd() * 200000),
        };
      case "traffic":
        return {
          source: SAMPLE.sources[i % SAMPLE.sources.length],
          visits: fmt(rnd() * 300000 + 500),
          share: (rnd() * 30).toFixed(1) + "%",
          change: (rnd() * 30 - 12).toFixed(1) + "%",
        };
      default:
        return {};
    }
  });
}
