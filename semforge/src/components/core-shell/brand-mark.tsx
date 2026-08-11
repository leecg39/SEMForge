// @TASK P1-F1-T1 - Independent SEMForge brand mark
// @SPEC SEMForge paid beta plan#independent-brand
// @TEST src/components/core-shell/core-shell.test.ts
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="sf-brand" aria-label="SEMForge 주간 검색 가시성">
      <svg
        className="sf-brand__mark"
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M6 7.5h13.5a6.5 6.5 0 0 1 0 13H13a3.5 3.5 0 0 0 0 7h13" />
        <path d="M8 14.5h11.5a6.5 6.5 0 0 1 0 13" />
      </svg>
      <span className="sf-brand__copy">
        <strong>SEMForge</strong>
        {!compact && <small>주간 검색 가시성</small>}
      </span>
    </span>
  );
}
