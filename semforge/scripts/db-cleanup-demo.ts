import path from "node:path";
import Database from "better-sqlite3";

/**
 * 데모 시드 데이터 정리 스크립트.
 * `npm run db:cleanup:demo` 로 실행한다.
 *
 * 삭제 대상 (source 컬럼 기준 demo-* 만 선별 — 실측 행은 보존):
 *   - keyword_metrics: demo-keyword-model (FK cascade 로 연결된 demo serp 도 함께)
 *   - serp_snapshots:  demo-serp-collector
 *   - clickstream_events: demo-panel
 *   - link_graph_edges: demo-link-crawler (site-audit-crawler 실측은 보존)
 *
 * 필요 시 `SEED_DEMO_DATA=1 npm run db:seed:analytics` 로 재생성할 수 있다.
 */

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");

const targets: { table: string; where: string }[] = [
  { table: "serp_snapshots", where: "source LIKE 'demo%'" },
  { table: "keyword_metrics", where: "source LIKE 'demo%'" },
  { table: "clickstream_events", where: "source LIKE 'demo%'" },
  { table: "link_graph_edges", where: "source LIKE 'demo%'" },
];

console.log(`[db-cleanup] 대상 DB: ${dbPath}`);
let totalDeleted = 0;
const run = sqlite.transaction(() => {
  for (const target of targets) {
    const before = (
      sqlite.prepare(`SELECT COUNT(*) AS c FROM ${target.table}`).get() as { c: number }
    ).c;
    const result = sqlite.prepare(`DELETE FROM ${target.table} WHERE ${target.where}`).run();
    const after = before - result.changes;
    totalDeleted += result.changes;
    console.log(
      `[db-cleanup] ${target.table}: ${result.changes}행 삭제 (${before} → ${after})`
    );
  }
});
run();

if (totalDeleted > 0) {
  console.log("[db-cleanup] VACUUM 실행 중…");
  sqlite.exec("VACUUM");
}
console.log(`[db-cleanup] 완료 — 총 ${totalDeleted}행 삭제`);
sqlite.close();
