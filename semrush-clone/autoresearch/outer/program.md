# Analytics recursive-improvement directive

## Objective

`docs/data-architecture.md`의 “원천 스토어 3개 + 순수 파생 지표”를 실제 Domain Overview 기능으로 정확하고 안전하게 제공한다.

## Fixed success criteria

- `npm exec tsx autoresearch/eval/score.ts`의 고정 점수 100/100
- `npm run test:analytics`, `npx tsc --noEmit`, `npm run lint`, `npm run build` 모두 통과
- `/analytics/overview/` 실제 브라우저 검사에서 콘솔 오류 0, 필수 DOM/폼/레이아웃 검사 통과
- 독립 감사에서 P0/P1 미해결 0건
- 점수를 높일 수 있는 새 원자적 가설이 연속 3회 나오지 않으면 수렴으로 판정

## Inner-loop scope

- `src/lib/analytics/**`
- `src/server/analytics.ts`
- `src/app/api/analytics/**`
- `src/components/analytics/**`
- `src/db/schema/analytics.ts`
- analytics 전용 seed/migration 및 직접 연결 지점

## Immutable during the loop

- `autoresearch/eval/**`
- `autoresearch/meta_eval/**`
- `docs/data-architecture.md`
- 기존 비-analytics 사용자 변경

## Experiment rules

1. 한 이터레이션에는 하나의 검증 가능한 가설만 적용한다.
2. 점수 상승 또는 동일 점수에서 명백한 단순화만 유지한다.
3. 고정 점수 개선 뒤에는 빠른 테스트와 타입 검사를 guard로 실행한다.
4. 전체 guard는 최종 수렴 시 실행한다.
5. 공유 작업 트리가 dirty이므로 원 저장소에서 reset/revert하지 않는다. 격리된 임시 Git 실험 저장소에서 commit-before-verify를 수행하고, keep된 패치만 원본에 적용한다.

