# SEO Dashboard Design QA

## Evidence

- Source visual truth: `/Users/user01/Desktop/SEO대시보드.png`
- Browser-rendered implementation: `/Users/user01/Music/SEMForge/semforge/artifacts/seo-dashboard-qa/implementation-1904-full.png`
- Full-view comparison: `/Users/user01/Music/SEMForge/semforge/artifacts/seo-dashboard-qa/comparison-full-final.png`
- Focused above-the-fold comparison: `/Users/user01/Music/SEMForge/semforge/artifacts/seo-dashboard-qa/comparison-top-final.png`
- Route and state: `/seo/`, authenticated Korean workspace, project `유인어스`, domain `uinus.co.kr`, all widgets visible, SEMForge data tab selected
- CSS viewport: `1904 × 947`; device pixel ratio `1`; visual viewport `1889px` because of the 15px vertical scrollbar
- Source pixels: `1904 × 2679`
- Implementation pixels: `1889 × 2192`
- Density normalization: the full-view pair was scaled to equal 952px column widths and padded to a common 1340px comparison frame. The focused pair used the top `1904 × 947` source crop and an implementation crop normalized to the same CSS width, then downscaled equally.

## Findings

- No actionable P0, P1, or P2 visual differences remain.
- The SEMForge AppShell, global navigation, and project-specific live/empty states intentionally differ from the Semrush reference. This is required by the implementation contract: the existing shell must be preserved and unavailable metrics must not be fabricated.
- The source shows populated AI/GSC examples, while the implementation truthfully shows no AI Visibility project and a GSC property mismatch for the current domain. Card placement, hierarchy, and empty-state treatment still follow the source composition.

## Required Fidelity Surfaces

- Fonts and typography: existing SEMForge typography tokens are preserved. Dense 11–16px UI text, medium/bold hierarchy, truncation, wrapping, and numeric emphasis remain readable at all tested breakpoints.
- Spacing and layout rhythm: 24px grid gaps, 8px card radii, shallow card elevation, compact padding, and the wide 6-column composition match the reference intent. DOM measurements confirm the 3/3 first row, 1/2/1/1/1 second row, and 4/2 analysis split at the wide breakpoint.
- Colors and tokens: white cards, light gray canvas, purple AI accents, blue links, green live states, and red/green deltas use the existing SEMForge token system with sufficient contrast.
- Image quality and assets: all custom empty states use generated raster assets from `public/seo-dashboard/`; there are no handcrafted SVG illustrations, emoji, or CSS-drawn substitutes. Icons use the existing Radix icon family, and charts use Recharts.
- Copy and content: labels describe actual sources and states. Missing sources use `소스 없음`, `연결 필요`, `분석 전`, or `준비 중`; no demo or inferred values are presented as data.

## Responsive and Interaction Evidence

- `1904 × 947`: 6-column content grid; 12 widgets visible; document scroll width `1889`, matching the visual viewport.
- `1440 × 900`: 4-column content grid; document scroll width `1425`, matching the visual viewport.
- `768 × 900`: 2-column content grid; document scroll width `753`, matching the visual viewport.
- `390 × 844`: 1-column stack; document scroll width `375`, matching the visual viewport.
- Tested project creation modal open and Escape close, canonical share URL copy with `?domain=`, GSC domain mismatch state, SEMForge/Google data tabs, widget hide, individual restore, and all-widgets-restored state.
- Console review found two historical React `key`-spread errors at `10:02`, fixed before the final capture. There were no new console errors after the fix; subsequent entries are HMR logs and one non-blocking Next.js LCP development warning.
- Keyboard-accessible native controls, Radix dialog focus management, explicit button labels, `aria-live` status messaging, and chart text summaries are present.

## Comparison History

1. Initial responsive pass found a P2 layout gap at 768px: the one-column position-tracking card was followed by a two-column site-audit card, leaving half a row empty.
2. Fixed `SeoWidgetDashboard.module.css` so position tracking and site audit share the first two-column row, on-page and backlink audit share the next row, and organic traffic insight spans the full row.
3. Post-fix DOM evidence at 768px: position tracking `x=24, width=341`; site audit `x=389, width=341`; on-page `x=24`; backlink audit `x=389`; organic traffic insight `width=705`. No horizontal overflow remained.
4. Final source/implementation comparison found no remaining actionable P0/P1/P2 differences. The remaining shell and data-state differences are intentional product constraints, not fidelity defects.

## Follow-up Polish

- P3: a production data source for GA4, paid keywords, backlink audit, and organic traffic insights would increase content parity, but those backends are explicitly outside this scope.

final result: passed

---

# AI Prompt Research Design QA

## Evidence

- Source visual truth: `/var/folders/04/y54015w94szby3vf2k72l9wr0000gp/T/codex-clipboard-065d460d-14df-468b-b54f-1b839e171b84.png`.
- Browser-rendered implementation: `/Users/user01/Music/SEMForge/semforge/artifacts/prompt-research/implementation-1904x947.png`.
- Same-frame comparison: `/Users/user01/Music/SEMForge/semforge/artifacts/prompt-research/comparison-1904x947.png`.
- Route and state: `/ai-seo/prompt-research/?fid=01KYP38EK00PHM1P0YK8BSV6EJ`, authenticated Korean workspace, project `유인어스`, ChatGPT/KR actual observations plus the generated seed `기업 인수 합병`.
- CSS viewport: `1904 × 947`; device pixel ratio `1`. The 1550 × 956 clipboard reference was normalized to the user-specified 1904 × 947 viewport before the side-by-side comparison.

## Findings

- No actionable P0, P1, or P2 visual or interaction differences remain.
- The implementation preserves the existing SEMForge global header and AppShell, while the source uses the Semrush shell. Inside the product content surface, both keep the same hierarchy: title/search controls, platform/date context, five summary metrics, rating banner, tabbed research table, filters, and row-level monitoring actions.
- The source's third-party AI search-volume and sparkline values are not available from a trustworthy project source. The implementation intentionally displays `n/a` and uses actual response counts, brand evidence, and citation domains instead of fabricating parity values.

## Responsive and Interaction Evidence

- `1904 × 947`: wide metric strip and dense research table, no horizontal overflow.
- `1440 × 947`: document width `1425`, no horizontal overflow.
- `768 × 947`: document width `753`, cards and table fields stack without page-level overflow.
- `390 × 947`: document width `390`, single-column controls and no horizontal overflow.
- Generated ten validated question candidates through the connected `chatmock/gpt-5.6-luna` ChatGPT-compatible provider, then persisted one candidate as the seventh monitored prompt.
- Reload preserved the monitored prompt in the database and restored generated candidates from session storage. Topic, prompt, brand, and source tabs; text filtering; intent filtering; detail expansion; collection; and CSV export controls are wired.
- A clean authenticated reload produced no `Runtime.exceptionThrown`, console error, or console warning entries.

## Data-Truth and Accessibility Evidence

- All observed brand and source rows use persisted observation IDs and citations from the selected run/provider/location scope. Generated candidates remain labeled `미수집` until an actual collection run exists.
- Search volume remains nullable, and unavailable citation domains render an explicit empty state.
- Native form controls support keyboard submission; icon-only actions have accessible labels; status changes use `aria-live`; intent bars expose a text alternative; monitored buttons expose a stable disabled state.
- `npm run test:ai-visibility` passes 38 tests, targeted ESLint passes, TypeScript passes, and the production build completes.

final result: passed

---

# AI Brand Performance Design QA

## Evidence

- Source visual truth: `/Users/user01/Desktop/화면 기록 2026-08-03 오전 5.42.46.mov` onboarding frame and `/Users/user01/Desktop/브랜드성과.png` populated-report reference.
- Browser-rendered implementation: `/Users/user01/Music/SEMForge/semforge/artifacts/brand-performance-qa/report-real-chatgpt-seoul-1904-full.png`.
- Normalized onboarding comparison: `/Users/user01/Music/SEMForge/semforge/artifacts/brand-performance-qa/onboarding-comparison.png`.
- Populated-report comparison: `/Users/user01/Music/SEMForge/semforge/artifacts/brand-performance-qa/report-reference-vs-real.png`.
- Responsive populated captures: `report-real-chatgpt-seoul-1440.png`, `report-real-chatgpt-seoul-768.png`, and `report-real-chatgpt-seoul-390.png` in the same artifact directory.
- Route and state: `/ai-seo/brand-performance/?fid=01KYN35XKSN0232CW97982YDT8`, authenticated Korean workspace, project `맥킨지 코리아`, ChatGPT/Seoul run completed from three real response bodies.
- Source pixels: `1904 × 5021`; implementation full-view pixels: `1904 × 2600`; CSS viewport: `1904 × 947`; device pixel ratio: `1`.
- Density normalization: both full pages were scaled to 950px-wide columns. The shorter implementation was bottom-padded on white to the source comparison height; the visible dashboard regions were not stretched or cropped.

## Findings

- No actionable P0, P1, or P2 visual or interaction differences remain in the onboarding or populated report states.
- The implementation preserves the SEMForge global header and AppShell, so its content starts below the existing product chrome while the source video omits that header. The dashboard hierarchy, centered hero, domain action, analyzed-project list, benefit cards, spacing rhythm, and purple action treatment follow the source intent.
- The populated implementation is shorter than the reference because it truthfully renders three current prompts and one observed comparison brand instead of the reference's larger sample. This is a data-density difference, not a layout omission: insight, scatter, sentiment, share, heatmap, comparison, formula, and strategy sections are all present in the same order.
- The initial New York report treated `McKinsey & Company` as a competitor because the Korean project had no English alias. The project now stores `McKinsey & Company`, `McKinsey`, and `맥킨지` as owned-brand aliases; detected own-brand collisions are merged or retired before comparison metrics are built.

## Required Fidelity Surfaces

- Fonts and typography: the existing SEMForge font stack and compact 9–20px reporting hierarchy match the dense reference. Real Korean/English strings wrap without clipping at all tested widths.
- Spacing and layout rhythm: the wide 2-column analysis grid, full-width heatmap, 2-column comparison cards, and 3-column strategy cards match the reference hierarchy with 8px cards, shallow borders, and compact section gaps.
- Colors and tokens: white cards, gray canvas, purple AI accents, pale-blue analysis callouts, emerald completeness state, and per-brand colors preserve the source's semantic balance and existing app tokens.
- Image quality and assets: onboarding uses existing product raster/SVG assets; report icons use the existing Radix family and charts use Recharts. No emoji, handcrafted SVG, CSS drawing, or placeholder artwork replaces a target asset.
- Copy and content: all visible metrics and recommendations come from persisted ChatGPT response bodies. Unobserved owned/competitor brands use `n/a`, `관측 없음`, or `브랜드 언급 없음`; no reference values are copied into the product.

## Responsive and Accessibility Evidence

- `1904 × 947`: document scroll width `1889`, client width `1889`, no horizontal overflow; 2-column analysis and comparison layouts plus 3-column strategies.
- `1440 × 900`: document scroll width `1425`, client width `1425`, no horizontal overflow.
- `768 × 1024`: document scroll width `753`, client width `753`, no horizontal overflow; report cards stack and the heatmap owns its local scroll surface.
- `390 × 844`: document scroll width `390`, client width `390`, no horizontal overflow; controls, chips, cards, and strategy content stack to one column.
- Date/location filter switched from the live KR run to the prior US run and back, changing both the canonical query string and visible insights. Toggling `K-Startup` removed/restored it from all chart text summaries. The four-brand manager opened with accessible labels and closed with Escape.
- Loading/status content uses `aria-live`; brand chips expose `aria-pressed`; scatter and donut charts expose data-bearing text alternatives; the narrative heatmap remains a semantic table.
- A clean reload produced no `Runtime.exceptionThrown` or error/warning log entries.

## Data-Truth and Contract Evidence

- ChatGPT account authentication is connected through the local OpenAI-compatible provider, with `chatgpt_web` enabled without exposing or persisting an API key.
- The Seoul run completed `3/3` observations with three response bodies; the report completed `3/3 (100%)` with provenance `chatmock/gpt-5.6-luna`.
- The report formulas use only persisted response text, validate brand/evidence references, size scatter bubbles by mentioned-answer count, and expose `n/a`/`관측 없음` rather than zero for unavailable observations.
- Strict model JSON validation now extracts fenced JSON safely, retries once with validation feedback, and supports an explicit API retry for interrupted background work without changing the input hash.
- `npm run test:ai-visibility` passes 24 tests; TypeScript, full lint, and `npm run build` pass on Node 25. Lint has 13 pre-existing unrelated `<img>` optimization warnings and zero errors.

## Comparison History

1. The first populated run exposed a data-entity P2: the owned Korean brand and the observed English `McKinsey & Company` name were split into own and competitor entities.
2. Added owned-brand aliases, filtered alias collisions during tracked-brand aggregation, retired conflicting detected competitors, and added a regression test.
3. The first analyzer output failed strict JSON validation and a development hot reload left one background report in `running`. Added balanced JSON-object extraction, explicit enum/shape instructions, one validation-guided correction pass, and an explicit retry flag.
4. The final Seoul capture shows a completed `3/3` report, correct own-brand absence state, four comparison slots, real strategy evidence, no horizontal overflow, and no console errors.

## Follow-up Polish

- P3: the report will naturally approach the reference's vertical density as the prompt library and historical runs grow; no fabricated rows should be added for visual parity.

final result: passed
