# NAVER Keyword Explorer Code Review

Goal: final UI review for NAVER keyword explorer.

Scope reviewed:
- `src/app/(app)/analytics/keywordmagic/page.tsx`
- `src/components/analytics/naver-keywords/*`
- `src/app/(app)/analytics/[...seg]/page.tsx` keywordmagic removal
- API contract checks against `src/app/api/analytics/naver-keywords/{explore,save}/route.ts`
- Content/ad handoff receivers in `src/components/content/naver-handoff.ts` and `src/components/advertising/naver-handoff.ts`

Skill-perspective check:
- Consulted local `remove-ai-slops` skill from `/Users/user01/.codex/plugins/cache/sisyphuslabs/omo/4.16.0/skills/remove-ai-slops/SKILL.md`.
- Consulted local `programming` skill and TypeScript references from `/Users/user01/.codex/plugins/cache/sisyphuslabs/omo/4.16.0/skills/programming/`.
- No deletion-only or tautological removal tests found in the reviewed tests. There is some manual boundary normalization in UI code; it did not rise to a blocker because it is guarding a fetch/API boundary and preserving provider provenance.

Evidence:
- `npx tsx --test src/components/analytics/naver-keywords/model.test.ts src/components/analytics/naver-keywords/KeywordResults.test.tsx src/components/content/naver-handoff.test.ts src/components/advertising/naver-handoff.test.ts`: PASS, 19 tests.
- `npm run test:naver`: PASS, 39 tests.
- `npx tsc --noEmit --pretty false`: PASS.

## CRITICAL

None.

## HIGH

1. Query-string deep links are ignored after the first auto-run on the same client instance.
   - Files: `src/app/(app)/analytics/keywordmagic/page.tsx:29`, `src/components/analytics/naver-keywords/NaverKeywordExplorer.tsx:127-199`
   - `NaverKeywordExplorer` initializes `seeds` from `safeInitialSeeds` only once and uses `autoRanRef` to prevent later auto-runs. If the user is already on `/analytics/keywordmagic/` and navigates to another URL with a different `keyword` or `keywords` query, the server page can pass new `initialSeeds`, but the client component keeps the previous state and `autoRanRef.current` prevents `runExplore` from running for the new query.
   - Impact: SEO dashboard/content handoff links to Keyword Magic can show stale results for a newly requested keyword.
   - Required fix: key the client component by a normalized seed signature in `page.tsx`, or make the effect compare the current seed signature and reset/auto-run when it changes.

## MEDIUM

1. Advertising handoff drops the NAVER ad metrics that the receiver explicitly supports.
   - Files: `src/components/analytics/naver-keywords/model.ts:248-276`, `src/components/advertising/naver-handoff.ts:104-138`
   - `parseNaverAdvertisingHandoff` accepts `naverMonthlyPcQueries`, `naverMonthlyMobileQueries`, `naverMonthlyTotalQueries`, click, CTR, and competition params, and the dashboard renders them when present. `buildActionHref("advertising", ...)` only sends keywords/provenance/measurement and unused intent params, so the ad handoff card cannot show the selected row's NAVER Search Ads metrics.
   - Impact: the "from NAVER Search Ads" ad handoff loses the actual values users just selected.
   - Required fix: either pass the first/primary selected row metrics using the receiver's existing param names, or remove the receiver/UI expectation and tests for transferred stats.

2. Query collection can discard valid deep-link seeds before normalization.
   - File: `src/app/(app)/analytics/keywordmagic/page.tsx:14-25`
   - `collectInitialSeeds` slices to five raw split tokens before trimming/filtering. A query such as `?keywords=,,,,,SEO` or a combined `keyword`/`keywords` URL with early blanks/duplicates can consume the five-token budget and drop later valid seeds before `normalizeSeeds` gets a chance to clean them.
   - Impact: valid inbound keyword links can land on an empty initial explorer instead of auto-running.
   - Required fix: normalize/filter/dedupe before applying the five-seed limit, using the same `normalizeSeeds` semantics or a shared safe parser.

## LOW

1. The page-select checkbox does not expose a mixed state.
   - File: `src/components/analytics/naver-keywords/KeywordResults.tsx:113-114`, `src/components/analytics/naver-keywords/KeywordResults.tsx:219-224`, `src/components/analytics/naver-keywords/KeywordResults.tsx:268-272`
   - When some but not all visible rows are selected, the "select current page" checkbox renders as unchecked rather than indeterminate.
   - Impact: screen-reader and keyboard users lose the partial-selection state.
   - Suggested fix: drive the native checkbox `indeterminate` property with a ref and expose the mixed state consistently on desktop and mobile.

codeQualityStatus: BLOCK
recommendation: REQUEST_CHANGES
blockers:
- Fix the HIGH deep-link state bug before approval.
