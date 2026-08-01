# 포지션 추적 페이지 구현 계획

> 확정: 2026-08-01 · 근거: Semrush 포지션 추적 화면 녹화(124초) 분석 + 기존 구현 실측

## 목표

Semrush 포지션 추적 화면의 구조를 SEMForge에 이식한다. 새로 만드는 것이 아니라
기존 3,668줄을 9탭 구조로 재구성하고 파생 지표를 채우는 작업이다.

## 착수 시점 실측

| 항목 | 상태 |
|---|---|
| 기존 코드 | 컴포넌트 7개(2,105줄), 서버 2모듈(788줄), API 8개, 페이지 2개 |
| DB 테이블 | `position_tracking_campaigns` / `_competitors` / `_visibility_history` / `serp_snapshots` |
| `serp_snapshots` 컬럼 | domain, url, position, is_ad, title, description, serp_features, captured_at |
| 스냅샷 건수 | 30건 |
| `keyword_metrics.volume` | 컬럼 존재하나 3건 전부 데모·값 0 → **실데이터 없음** |

## 데이터 실현성 확정

| 기능 | 판정 |
|---|---|
| 가시성·평균 포지션·순위 분포 | 기존 데이터로 가능 |
| 신규·누락·상승/하락·스파크라인 | 이력 비교로 계산 가능 |
| 페이지별 순위·카니발리제이션·추천 스니펫 | `serp_snapshots`만으로 가능 |
| 태그 | 신규 테이블 필요, 외부 의존 없음 |
| **예상 트래픽** | volume 실데이터 없음 → **unavailable 표시** |
| **추천 경쟁자(유료)** | 광고 제공사 미연동 → **unavailable 표시** |
| **Looker Studio** | 외부 연동 → **범위 제외** |

## Phase

| Phase | 내용 | 담당 | 신규 API |
|---|---|---|---|
| 1 | 9탭 셸 + 현황 탭 재배치, 지표 카드 3개, 키워드 요약 패널 | 오케스트레이터 | 0 |
| 2 | 이력 기반 파생 지표(신규·누락·상승/하락·스파크라인·증감) | Codex A | 0 |
| 3 | 페이지별 순위 / 카니발리제이션 / 추천 스니펫 | Codex B | 0 |
| 4 | 태그(키워드 그룹) — 마이그레이션 1건, 승인 게이트 | 미배정 | 0 |
| 5 | 경쟁자 모달(20개 상한) + 내보내기 | 미배정 | 0 |

## 탭 구성 (영상 기준)

현황 / 개요 / 순위 분포 / 태그 / 페이지 / 기기 및 위치 / 카니발리제이션 / 경쟁자 발견 / 추천 스니펫

## 위험

- **높음**: `PositionTrackingDashboard.tsx` 956줄. 탭 분해 시 800줄 상한을 넘지 않도록 분할 필요.
  같은 워크트리에 다른 에이전트가 작업 중이라 파일 소유권 분리가 필수.
- **중간**: 라우트가 `/position-tracking/` 과 `/app/position-tracking/` 둘 다 존재. 정본 정리 필요.
- **낮음**: 예상 트래픽은 volume 수집이 시작되면 자동으로 채워지도록 설계한다.

## 파일 소유권 (동시 작업 충돌 방지)

| 담당 | 소유 |
|---|---|
| 오케스트레이터 | `components/position-tracking/**`, `app/(app)/position-tracking/**` |
| Codex A | `server/position-tracking/trends.ts(.test)` |
| Codex B | `server/position-tracking/page-insights.ts(.test)` |

기존 `insights.ts`(getRankDistribution, getDiscoveredCompetitors)와 `schedule.ts` 는 아무도 수정하지 않는다.

## 완료 조건

- 9탭이 렌더되고 기존 위젯이 해당 탭에 배치된다
- 지표 카드가 실데이터로 채워지며, 데이터 없는 항목은 0 이 아니라 미표시/unavailable 이다
- Phase 2·3 모듈이 단위 테스트를 갖는다
- `npm run verify` exit 0
