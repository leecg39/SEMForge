# NKI-PUBLIC-UI Code Review

## Scope
- Reviewed only:
  - `semforge/src/components/free-tools/NaverKeywordPreview.tsx`
  - `semforge/src/components/free-tools/NaverKeywordPreview.test.ts`
  - `semforge/src/app/(public)/free-tools/[slug]/page.tsx`
- No production/test fixes were made.
- No runnable evidence path or prior test output was provided. I inspected the diff and current file contents directly.

## Skill-Perspective Check
- `remove-ai-slops`: unavailable. No `remove-ai-slops/SKILL.md` was found under the available skill roots.
- `programming`: unavailable. No `programming/SKILL.md` was found under the available skill roots.
- Applied the documented criteria from the prompt instead.
- Skill-perspective result: violations found. The test file presents itself as a contract test but only checks helper formatting/normalization, leaving the requested backend/error/UI contract untested.

## CRITICAL
- None.

## HIGH
1. `semforge/src/components/free-tools/NaverKeywordPreview.tsx:525` / `semforge/src/components/free-tools/NaverKeywordPreview.tsx:532` / `semforge/src/components/free-tools/NaverKeywordPreview.tsx:547` / `semforge/src/components/free-tools/NaverKeywordPreview.tsx:594` / `semforge/src/components/free-tools/NaverKeywordPreview.tsx:597`
   A failed lookup after a previous successful lookup keeps rendering the previous report. `submit` sets the new submitted keyword and clears only `error`; it never clears or invalidates `report` before the request, and the catch path only sets an error. The render path then displays both the error and the old report. `activeKeyword` also prefers `report?.keyword`, so the 429 signup CTA can preserve the old successful keyword instead of the failed attempted keyword. This violates the failure/partial/unavailable requirement because users can see stale metrics for a different keyword after a failed request.

2. `semforge/src/components/free-tools/NaverKeywordPreview.tsx:394` / `semforge/src/components/free-tools/NaverKeywordPreview.tsx:400`
   Blog API examples are rendered as an ordered list with visible numeric badges. Even though the copy says the count is not a ranking, the UI still presents the returned blog examples as positions 1, 2, 3. For an SEO keyword tool this is a prohibited ranking implication and conflicts with the requirement to avoid rank claims for Blog Search/API responses.

3. `semforge/src/components/free-tools/NaverKeywordPreview.test.ts:12` / `semforge/src/components/free-tools/NaverKeywordPreview.test.ts:16` / `semforge/src/components/free-tools/NaverKeywordPreview.test.ts:31`
   The test file is labeled as a preview contract test, but it only verifies three local helper functions. It does not cover the actual backend contract shape `{ data: { keyword, generatedAt, searchAds, trend, blog } }`, 503 responses that still carry a data report, 429 `details.retryAfter`, partial/unavailable sections, stale-result prevention, accessible status/link behavior, or the no-ranking blog presentation. Under the remove-ai-slops/programming perspectives this is a high-value false-confidence test gap for the explicit success criteria.

## MEDIUM
- None reported; review was limited to blocker/high findings by request.

## LOW
- None reported; review was limited to blocker/high findings by request.

## Recommendation
- `codeQualityStatus`: `BLOCK`
- `recommendation`: `REQUEST_CHANGES`
- `blockers`:
  - Prevent stale previous reports and stale CTA keywords from displaying after validation/request/rate-limit failures.
  - Remove ordered/numeric presentation from Blog Search examples so the UI cannot imply ranking.
  - Add relevant contract/error/UI tests for the requested backend response and failure/partial/unavailable behavior.
