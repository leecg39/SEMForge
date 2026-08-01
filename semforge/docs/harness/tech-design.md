# Site Audit Project Hub — 기술 설계

## 기존 스택 유지

- Next.js 16 App Router / React 19 / TypeScript
- Tailwind CSS 4와 기존 `app-*` 디자인 토큰
- Drizzle ORM + SQLite(`better-sqlite3`)
- 실제 수집: Firecrawl 우선, 자체 BFS 폴백
- 성능 지표: Google PageSpeed Insights
- 인증·권한: 기존 세션/RBAC/워크스페이스 격리 계층

새 애플리케이션이나 별도 백엔드를 만들지 않고 현재 모놀리식 구조 안에서 확장한다.

## 화면 구조

- `/siteaudit/`: 프로젝트 현황 목록. `folders`와 Site Audit 상태를 조합한다.
- `/siteaudit/?campaign=<id>`: 기존 상세 리포트. 현재 딥링크를 유지한다.
- 목록 UI는 서버가 초기 데이터를 제공하고 클라이언트가 검색·페이지네이션·실행 중 폴링을 담당한다.
- 프로젝트 생성과 진단 설정은 접근 가능한 모달 컴포넌트로 분리한다.

## 서버 구조

- 프로젝트 허브 서비스: 폴더, 캠페인, 최신 실행, 직전 완료 실행을 워크스페이스 범위에서 조합한다.
- 도메인 검증 서비스: 호스트 정규화, 공인 DNS/IP 확인, 안전한 HTTP 리다이렉트 확인, 중복 프로젝트 조회.
- 실행 서비스: 실행 레코드 생성 → 백그라운드 처리 → 진행률 갱신 → 결과/스냅샷/알림 저장.
- 즉시 실행은 Next.js `after()`로 응답 이후 시작한다. 기존 due-runner는 예약 실행과 중단된 큐 복구를 담당한다.
- 모든 변경 API는 기존 `requireAuth`, `assertCan`, `assertSameWorkspace`를 통과한다.

## 데이터 구조

- `folders`: SEO 프로젝트. 영상과 동일하게 같은 도메인의 복수 프로젝트를 허용하되 이름/ID로 구분한다.
- `site_audit_campaigns`: 프로젝트별 활성 진단 설정. 새 프로젝트는 `folder_id` 필수, 알림과 고급 규칙 JSON을 보관한다.
- `site_audit_runs`: 실행 상태와 진행률, 엔진, 오류, 시작/완료 시각을 보관한다.
- `site_audit_metric_snapshots`: 실행별 진단/테마/PSI 지표를 보관해 변화량을 계산한다.
- `site_audit_notifications`: 실행 완료/실패 인앱 알림. `(run_id, channel)` 유일 키로 중복 발송을 막는다.
- 기존 `site_audit_pages`와 `site_audit_issues`는 최신 상세 리포트의 원본 데이터로 유지한다.

## 크롤 규칙

- 경로 허용/비허용 규칙은 정규화된 URL pathname에 적용한다.
- 무시할 쿼리 매개변수는 URL 정규화 단계에서 제거해 중복 방문을 방지한다.
- 사용자 에이전트 선택은 허용된 프리셋만 저장한다.
- 각 수집 엔진이 지원하지 않는 설정은 서버 검증에서 거절한다.

## 진행률과 복구

- 실행 생성 시 `queued`, 실제 수집 시작 시 `running`, 종료 시 `completed|failed`로 단방향 전이한다.
- 크롤러는 고유 페이지가 추가될 때마다 진행 콜백을 호출한다. DB 쓰기는 짧은 간격으로 묶어 저장한다.
- 동일 캠페인의 활성 실행은 하나만 허용한다.
- 일정 시간 이상 갱신되지 않은 `running` 실행은 due-runner가 실패 처리한 뒤 명시적 재시도를 허용한다.

## 지표

- 크롤/이슈/테마 값은 기존 실제 분석 로직을 재사용한다.
- PSI 성공 시 Performance 점수와 CWV 통과율을 실행 스냅샷에 저장한다.
- 직전 완료 실행이 없거나 측정 불가능하면 변화량은 `null`이다.
- 목록 API는 수치와 함께 provenance 및 미측정 사유를 반환한다.

## 알림

- 인앱 알림은 항상 DB에 저장한다.
- 이메일은 `RESEND_API_KEY`와 발신 주소가 설정된 경우에만 전송한다.
- 이메일 채널이 없으면 설정 UI가 이를 명시하고 인앱 알림만 활성화한다.

## 검증

- 순수 함수 단위 테스트: URL 규칙, CWV 점수, 변화량, 상태 전이.
- DB/API 테스트: 테넌트 격리, 프로젝트-캠페인 관계, 동시 실행 차단, 실행 스냅샷.
- 타입 검사, ESLint, Next production build.
- Homebrew Node 25 개발 서버에서 1904×947 브라우저 시나리오를 직접 검증한다.
