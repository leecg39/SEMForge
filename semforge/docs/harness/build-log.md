# Build Log — Site Audit Project Hub, Cycle 1

## 입력과 분석

- 첨부 106초 무음 영상을 프레임 단위로 확인했다.
- 0초의 프로젝트 지표 표, 생성 모달의 도메인 오류·중복 안내, 48초 이후 좌측 단계 설정, 72초 청록 실행 행, 105초 실제 `1/100` 진행률을 사양으로 고정했다.
- 기존 `/siteaudit/` 페이지, `SiteAuditDashboard`, 동기 run route, Firecrawl/자체 크롤러, PSI, 범용 resource API, Drizzle 스키마와 due scheduler를 직접 읽고 확장 지점을 정했다.

## 구현 커밋

| 커밋 | 내용 |
|---|---|
| `033137e` | Site Audit 하네스 사양·기능·rubric·기술 설계 |
| `6f22053` | 실행 이력, 진행률, 스냅샷, 알림, 고급 규칙, 비동기 실행 |
| `2058abf` | 프로젝트 허브 API, 도메인 검증, 목록 집계 테스트 |
| `f55c002` | 목록/상세 분리, 생성·단계 설정·진행 행·알림 UI |
| `208d098` | 큐 중복/테넌트/한도 테스트와 지표 출처 툴팁 |

## 데이터베이스

- 마이그레이션 `0017_fluffy_psylocke.sql`을 임시 DB와 실제 개발 DB에 적용했다.
- 적용 전 백업: `data/backups/app-20260801-002104.db`.
- 확인한 테이블: `site_audit_runs`, `site_audit_metric_snapshots`, `site_audit_notifications`.
- 확인한 제약: `site_audit_runs_active_unique`, `site_audit_folder_unique`, `folders_workspace_domain_idx`.

## 실제 브라우저 시나리오

1. owner 시드 계정으로 로그인 후 `/siteaudit/` 1904×947 목록 확인.
2. 프로젝트 생성 모달 열기, 경로가 포함된 도메인 제출, 400 필드 오류 확인.
3. 설정 전 Acme 프로젝트에서 5단계 모달 열기.
4. 크롤러 프리셋, URL 규칙, 예약·알림 단계 이동 확인.
5. 잘못된 `blog` 허용 경로 입력 시 저장 버튼 비활성과 오류 확인.
6. 이메일 제공자 미구성 설명과 비활성 체크박스 확인.
7. 기존 캠페인 딥링크로 상세 리포트와 목록 복귀 링크 확인.
8. Soverin 테스트 프로젝트를 UI에서 두 번 실행해 running 행, 완료 지표, 스냅샷 2건, 알림 2건 확인.
9. 상단 알림함에서 완료 메시지와 상세 링크 확인.
10. 375×812, 768×1024, 1280×720, 1904×947 반응형 캡처 확인.

## 검증 결과

```text
Homebrew Node: v25.4.0
TypeScript: pass
Target ESLint: pass
Site Audit tests: 16 pass, 0 fail
Next.js production build: pass, 278 pages generated
Browser console: 구현 오류 없음 (의도한 잘못된 도메인 POST 400 한 건만 기록)
```

## 운영 구성

- 실제 크롤: `FIRECRAWL_API_KEY`가 있고 선택 User-Agent가 지원되면 Firecrawl, 아니면 자체 크롤러. provenance에 엔진 저장.
- PSI: 실제 응답만 snapshot에 저장하며 실패 이유는 provenance에 저장.
- 이메일: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`이 모두 있을 때만 활성.
- 장기 실행 복구: `/api/cron/run-due/?only=site_audit`를 운영 스케줄러가 호출해야 queued/stale 복구와 예약 실행이 동작한다.

