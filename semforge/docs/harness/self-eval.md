# Self-Evaluation — Build Cycle 1

## 기능 완성도

| ID | 기능명 | 우선순위 | 상태 | 비고 |
|---|---|---:|---|---|
| F1 | 프로젝트 진단 현황 목록 | P0 | complete | 설정 전·실행·완료·실패 상태와 12개 지표를 한 표에 표시 |
| F2 | SEO 프로젝트 생성 | P0 | complete | 공개 도메인 검증, SSRF 차단, 중복 확인 포함 |
| F3 | 프로젝트 기반 진단 설정 | P0 | complete | 5단계 모달과 프로젝트당 활성 캠페인 제약 |
| F4 | 지속성 있는 비동기 진단 실행 | P0 | complete | 202 + `after()` + DB 큐 + due 복구 |
| F5 | 실시간 행 진행 상태 | P0 | complete | 실제 `crawledPages/pageLimit`, 활성 실행 중에만 폴링 |
| F6 | 실측 지표와 실행 대비 변화량 | P0 | complete | 스냅샷 2건의 최신-직전 계산과 출처 표시 |
| F7 | 검색·정렬·페이지네이션 | P1 | complete | 서버 처리 및 URL 동기화 |
| F8 | 기존 상세 리포트 연결 | P0 | complete | 목록/상세 분리, 기존 딥링크 유지 |
| F9 | 오류·접근성·반응형 상태 | P1 | complete | Radix 포커스 관리, live region, 고정 프로젝트 열 |
| F10 | 진단 완료 알림 | P2 | complete | 인앱 알림 실동작, 미구성 이메일 명시적 비활성 |
| F11 | 고급 크롤 규칙 | P2 | complete | 허용·제외 경로, 쿼리 제거, User-Agent 실제 적용 |
| F12 | AI 이슈 우선순위 요약 | P2 | partial | 제공자 미구성 환경의 무플레이스홀더 동작만 충족. 생성 기능 없음 |

모든 P0 기능은 완료됐다.

## Rubric 자체 채점

| 기준 | 자체 점수 | 임계값 | 자신감 | 근거 |
|---|---:|---:|---|---|
| C1. Reference UX Fidelity | 9 | 8 | 높음 | 1904×947 브라우저에서 영상과 같은 제목·툴바·광폭 지표 표·청록 실행 행·좌측 단계 모달을 확인 |
| C2. End-to-End Functionality | 9 | 8 | 높음 | UI 실행으로 202 등록, running 행, 완료 지표, 상세 이동, 인앱 알림까지 실제 데이터 흐름 확인 |
| C3. Data Integrity and Provenance | 8 | 8 | 높음 | 워크스페이스 격리 테스트, 실제 Firecrawl/PSI 스냅샷, null 미측정, 최신-직전 테스트와 출처 툴팁 |
| C4. Async Reliability | 8 | 7 | 중간 | 활성 실행 유일 인덱스와 중복 enqueue 테스트, 영속 진행률·due 복구 구현. 실제 프로세스 강제 종료 시나리오는 미실행 |
| C5. Responsive Accessibility | 8 | 7 | 중간 | 375·768·1280·1904px 확인, Radix Dialog, Escape, 텍스트 상태와 live region. 별도 스크린리더 도구 검증은 미실행 |
| C6. Engineering Quality | 9 | 7 | 높음 | Node 25에서 타입·대상 ESLint·16개 테스트·전체 Next 빌드 통과, 기존 상세 로직 재사용, 관련 없는 변경 미스테이징 |

가중 자체 점수: **8.55/10**, 모든 기준이 임계값 이상이다.

## 검증 증적

- 실제 실행 `sar_01KYXBPZWAEPRC0DJ8VPHPC1DP`, `sar_01KYXBSSBYHTJZ18CC5P8PZF25`: 각각 10페이지 제한, 2페이지 완료, 실패 fetch 0.
- 동일 캠페인에 완료 run 2건, metric snapshot 2건, 인앱 notification 2건이 실제 SQLite에 저장됨.
- 잘못된 `example.com/private/path` 프로젝트 생성은 POST 400과 필드 오류로 차단됨.
- 상세 딥링크 `/siteaudit/?campaign=01KYVYERAWVAZX3YNNPVX7G6JM`에서 기존 개요·문제·페이지·통계·테마 UI를 확인함.
- 브라우저 캡처: `/tmp/siteaudit-projects-1904.png`, `/tmp/siteaudit-running.png`, `/tmp/siteaudit-notification.png`, `/tmp/siteaudit-detail.png`, `/tmp/siteaudit-responsive-{mobile,tablet,desktop}.png`.

## 알려진 문제와 미확인 사항

1. F12의 AI 요약 생성·runId 버전 저장은 구현하지 않았다. 현재 AI 제공자 미구성 환경에서는 사양대로 CTA나 가짜 요약이 없다.
2. Resend 환경변수가 없어 이메일 실발송은 검증하지 않았다. API 계약과 멱등 저장 코드, UI 비활성 상태만 검증했다.
3. 프로세스를 강제로 종료한 뒤 due runner가 queued/stale 실행을 회수하는 운영 시나리오는 코드 검토만 했고 강제 종료 QA는 하지 않았다.
4. 모바일은 모든 지표를 카드로 축약하지 않고 고정 프로젝트 열이 있는 가로 스크롤 표를 사용한다.

## 개발 서버

- 앱: `http://localhost:3000/siteaudit/`
- 실행: `PATH=/opt/homebrew/bin:$PATH npm run dev`
- DB 마이그레이션: `PATH=/opt/homebrew/bin:$PATH npm run db:migrate`

