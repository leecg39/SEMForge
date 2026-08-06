import type { AuditOverview, AuditRiskLevel, AuditStatus } from "@/server/backlink-audit/contracts";

const riskTone: Record<AuditRiskLevel, string> = {
  high: "bg-[#ef4444]",
  medium: "bg-[#f59e0b]",
  low: "bg-[#49c99a]",
  unscored: "bg-[#a4a9b2]",
};

const statusTone: Record<AuditStatus, string> = {
  active: "bg-[#49c99a]",
  missing: "bg-[#f59e0b]",
  unavailable: "bg-[#ef7180]",
  unverified: "bg-[#a4a9b2]",
};

function compact(value: number, locale: "ko" | "en") {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    notation: "compact", maximumFractionDigits: 1,
  }).format(value);
}

function BarList({ rows, total, color, label }: {
  rows: Array<{ key: string; value: number }>;
  total: number;
  color: (key: string) => string;
  label: (key: string) => string;
}) {
  return <div className="space-y-3">{rows.map((row) => {
    const percent = total > 0 ? Math.round((row.value / total) * 1000) / 10 : 0;
    return <div key={row.key}>
      <div className="mb-1.5 flex items-center justify-between text-[11px]"><span className="font-medium text-app-text">{label(row.key)}</span><span className="text-app-text-secondary">{percent}% · {row.value.toLocaleString()}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-[#eef0f4]"><div className={`h-full rounded-full ${color(row.key)}`} style={{ width: `${percent}%` }} /></div>
    </div>;
  })}</div>;
}

export function BacklinkAuditOverviewPanel({ overview, locale }: { overview: AuditOverview; locale: "ko" | "en" }) {
  const ko = locale === "ko";
  const { totals } = overview;
  const reviewedPercent = totals.links ? Math.round((totals.reviewed / totals.links) * 100) : 0;
  const audited = totals.active + totals.missing + totals.unavailable;
  const auditPercent = totals.links ? Math.round((audited / totals.links) * 100) : 0;
  const kpis = [
    { label: ko ? "검토 필요" : "Pending review", value: totals.pending, note: ko ? "수동 판정 대기" : "Awaiting a decision" },
    { label: ko ? "위험 신호" : "Risk signals", value: totals.highRisk + totals.mediumRisk, note: ko ? `높음 ${totals.highRisk} · 중간 ${totals.mediumRisk}` : `High ${totals.highRisk} · Medium ${totals.mediumRisk}` },
    { label: ko ? "출처 도메인" : "Source domains", value: totals.sourceDomains, note: ko ? "실제 링크 기준" : "From real links" },
    { label: ko ? "대상 페이지" : "Target pages", value: totals.targetPages, note: ko ? `오류 링크 ${overview.topTargets.reduce((sum, row) => sum + row.brokenLinks, 0)}` : `${overview.topTargets.reduce((sum, row) => sum + row.brokenLinks, 0)} broken links` },
    { label: ko ? "신규 / 누락" : "New / lost", value: overview.changes.comparable ? `${overview.changes.newLinks ?? 0} / ${overview.changes.lostLinks ?? 0}` : "—", note: overview.changes.comparable ? (ko ? "최근 실행 비교" : "Compared with prior run") : (ko ? "2회 실행 후 계산" : "Available after two runs") },
  ];
  return <div className="space-y-4">
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">{kpis.map((item) => <article key={item.label} className="rounded-[9px] border border-app-border bg-white p-4">
      <p className="text-[10px] font-medium text-app-text-secondary">{item.label}</p>
      <p className="mt-1.5 text-[25px] font-semibold tracking-[-0.4px] text-app-text">{typeof item.value === "number" ? compact(item.value, locale) : item.value}</p>
      <p className="mt-1 text-[10px] text-app-text-secondary">{item.note}</p>
    </article>)}</section>

    <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <article className="rounded-[9px] border border-app-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[13px] font-semibold text-app-text">{ko ? "전체 감사 상태" : "Audit coverage"}</h2><p className="mt-1 text-[10px] text-app-text-secondary">{ko ? "위험 점수는 외부 사업자 점수가 아닌, 표시된 규칙의 검토 우선순위입니다." : "Risk priority comes only from the disclosed rules, not an external toxicity score."}</p></div><span className="text-[11px] font-semibold text-[#6557e8]">{auditPercent}% {ko ? "확인" : "checked"}</span></div>
        <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-[#eef0f4]">
          {overview.auditDistribution.map((row) => <div key={row.status} className={statusTone[row.status]} style={{ width: `${totals.links ? row.count / totals.links * 100 : 0}%` }} title={`${row.status}: ${row.count}`} />)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{overview.auditDistribution.map((row) => <div key={row.status} className="flex items-center gap-2 rounded-[7px] bg-[#f8f9fb] px-3 py-2 text-[10px]"><span className={`h-2 w-2 rounded-full ${statusTone[row.status]}`} /><span className="text-app-text-secondary">{{ active: ko ? "활성" : "Active", missing: ko ? "링크 없음" : "Missing", unavailable: ko ? "확인 불가" : "Unavailable", unverified: ko ? "확인 전" : "Unverified" }[row.status]}</span><strong className="ml-auto text-app-text">{row.count}</strong></div>)}</div>
        <div className="mt-5 border-t border-app-border pt-4"><div className="flex items-center justify-between text-[11px]"><span className="font-medium text-app-text">{ko ? "수동 검토 진행률" : "Manual review progress"}</span><span className="text-app-text-secondary">{totals.reviewed.toLocaleString()} / {totals.links.toLocaleString()}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef0f4]"><div className="h-full rounded-full bg-[#6557e8]" style={{ width: `${reviewedPercent}%` }} /></div></div>
      </article>
      <article className="rounded-[9px] border border-app-border bg-white p-5"><h2 className="text-[13px] font-semibold text-app-text">{ko ? "검토 우선순위 분포" : "Review priority distribution"}</h2><div className="mt-5"><BarList rows={overview.riskDistribution.map((row) => ({ key: row.level, value: row.count }))} total={totals.links} color={(key) => riskTone[key as AuditRiskLevel]} label={(key) => ({ high: ko ? "높음" : "High", medium: ko ? "중간" : "Medium", low: ko ? "낮음" : "Low", unscored: ko ? "미평가" : "Unscored" }[key] ?? key)} /></div></article>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
      <article className="overflow-hidden rounded-[9px] border border-app-border bg-white"><div className="border-b border-app-border px-5 py-3"><h2 className="text-[13px] font-semibold text-app-text">{ko ? "상위 출처 도메인" : "Top source domains"}</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-[11px]"><thead className="bg-[#f8f9fb] text-[10px] text-app-text-secondary"><tr><th className="px-4 py-2.5">{ko ? "도메인" : "Domain"}</th><th className="px-4 py-2.5 text-right">{ko ? "링크" : "Links"}</th><th className="px-4 py-2.5 text-right">{ko ? "위험" : "Risk"}</th><th className="px-4 py-2.5 text-right">{ko ? "미검토" : "Pending"}</th><th className="px-4 py-2.5">{ko ? "대표 앵커" : "Top anchor"}</th></tr></thead><tbody>{overview.topDomains.map((row) => <tr key={row.domain} className="border-t border-[#eef0f2]"><td className="px-4 py-3 font-medium text-[#285fca]">{row.domain}</td><td className="px-4 py-3 text-right">{row.totalLinks.toLocaleString()}</td><td className="px-4 py-3 text-right text-[#c13e3e]">{row.riskyLinks.toLocaleString()}</td><td className="px-4 py-3 text-right">{row.unreviewedLinks.toLocaleString()}</td><td className="max-w-[240px] truncate px-4 py-3 text-app-text-secondary">{row.topAnchor ?? "—"}</td></tr>)}{overview.topDomains.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-app-text-secondary">{ko ? "감사를 실행하면 실제 도메인 집계가 표시됩니다." : "Run an audit to populate domain rollups."}</td></tr>}</tbody></table></div></article>
      <article className="rounded-[9px] border border-app-border bg-white p-5"><h2 className="text-[13px] font-semibold text-app-text">{ko ? "상위 앵커" : "Top anchors"}</h2><div className="mt-4 space-y-1">{overview.topAnchors.map((row, index) => <div key={`${row.anchor}-${index}`} className="flex items-center gap-3 border-b border-[#eef0f2] py-2.5 last:border-0"><span className="w-5 text-[10px] text-app-text-secondary">{index + 1}</span><span className="min-w-0 flex-1 truncate text-[11px] text-app-text">{row.anchor}</span><strong className="text-[11px] text-[#285fca]">{row.count.toLocaleString()}</strong></div>)}{overview.topAnchors.length === 0 && <p className="py-8 text-center text-[11px] text-app-text-secondary">{ko ? "앵커 데이터가 없습니다." : "No anchor data."}</p>}</div></article>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-[9px] border border-app-border bg-white p-5"><h2 className="text-[13px] font-semibold text-app-text">{ko ? "링크 속성" : "Link attributes"}</h2><div className="mt-5"><BarList rows={[{ key: "follow", value: totals.follow }, { key: "nofollow", value: totals.nofollow }, { key: "sponsored", value: totals.sponsored }, { key: "ugc", value: totals.ugc }]} total={Math.max(1, audited)} color={(key) => key === "follow" ? "bg-[#49c99a]" : key === "nofollow" ? "bg-[#6557e8]" : "bg-[#f59e0b]"} label={(key) => key.toUpperCase()} /></div></article>
      <article className="overflow-hidden rounded-[9px] border border-app-border bg-white"><div className="border-b border-app-border px-5 py-3"><h2 className="text-[13px] font-semibold text-app-text">{ko ? "상위 대상 페이지" : "Top target pages"}</h2></div><div className="max-h-[310px] overflow-auto"><table className="w-full min-w-[520px] text-left text-[11px]"><thead className="sticky top-0 bg-[#f8f9fb] text-[10px] text-app-text-secondary"><tr><th className="px-4 py-2.5">URL</th><th className="px-4 py-2.5 text-right">{ko ? "링크" : "Links"}</th><th className="px-4 py-2.5 text-right">HTTP</th></tr></thead><tbody>{overview.topTargets.map((row) => <tr key={row.targetUrl} className="border-t border-[#eef0f2]"><td className="max-w-[380px] truncate px-4 py-3"><a href={row.targetUrl} target="_blank" rel="noopener noreferrer" className="text-[#285fca] hover:underline">{row.targetUrl}</a></td><td className="px-4 py-3 text-right">{row.links.toLocaleString()}</td><td className={`px-4 py-3 text-right font-medium ${row.status && row.status >= 400 ? "text-[#c13e3e]" : "text-app-text-secondary"}`}>{row.status ?? "—"}</td></tr>)}{overview.topTargets.length === 0 && <tr><td colSpan={3} className="px-4 py-10 text-center text-app-text-secondary">{ko ? "대상 페이지 데이터가 없습니다." : "No target page data."}</td></tr>}</tbody></table></div></article>
    </section>
  </div>;
}
