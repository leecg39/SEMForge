# Analytics autoresearch session

## State

- Mode: bounded-until-convergence
- Current iteration: 1
- Baseline: 45.00
- Best score: 50.00
- Kept: 1
- Discarded: 0
- Guard: pending

## Frozen metric

- Core evaluator: `npm exec tsx autoresearch/eval/score.ts`
- Frontend route contract: `autoresearch/eval/test-routes.json`
- Direction: higher is better; maximum 100
- The `eval/` and `meta_eval/` directories are immutable after baseline.

## Safety adaptation

The shared repository already contains unrelated uncommitted user work. Experiments use an isolated temporary Git repository for commit-before-verify. Only kept, reviewed patches are applied to the shared tree; destructive reset is forbidden there.

## Resume protocol

1. Read this file, `outer/program.md`, and the last 20 rows of `inner_results.tsv`.
2. Re-run the frozen score and compare it with Best score.
3. Run one atomic experiment in the isolated checkpoint repository.
4. Keep only a score increase or equal-score simplification with guards passing.
5. Update this file and `.Codex/progress.txt`.

## Findings and experiments

- Baseline locked at 45.00 (9/20 checks). The frozen evaluator exposed invalid temporal/numeric input handling, source-union coverage, latest-snapshot selection, unbounded repository reads, API country validation, and tab/loading accessibility gaps.
- Iteration 1 kept: invalid keyword dates are ignored; score 50.00, analytics tests and typecheck pass.
