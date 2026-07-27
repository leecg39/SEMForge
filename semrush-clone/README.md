# semrush-clone

Semrush의 공개 사이트와 로그인 앱을 UI/UX 관찰 기반으로 역설계해 재구축한 프로젝트입니다.
두 개의 레이어로 구성됩니다.

| 레이어 | 경로 | 성격 |
|---|---|---|
| 정적 UI 클론 | `/`, `/features/*`, `/pricing/*`, `/seo/`, `/siteaudit/` 등 246개 라우트 | 공개 사이트·앱 셸의 **구조/레이아웃 재현** (목 데이터) |
| CRUD 앱 | `/app/*` + `/api/*` | **실제 DB·인증·권한·감사 로그가 있는 동작하는 CRUD** |

내부 학습·구조 분석 목적입니다. 상표·로고·원문 콘텐츠는 중립 플레이스홀더로 대체하며,
로그인·권한 우회나 타 사용자 데이터 접근은 하지 않았습니다.

## 관련 문서

| 문서 | 내용 |
|---|---|
| `../SEMRUSH_UI_UX_PAGE_INVENTORY.md` | 공개 사이트 + 로그인 앱 244페이지 인벤토리 |
| `docs/research/APP_CRUD_EVIDENCE.md` | 로그인 앱 CRUD 실측 증거(화면·인터랙션·업무 규칙 추론) |
| `docs/research/APP_REBUILD_SPEC.md` | 재구축 명세(ERD·필드·상태 전이·API·정책) |
| `docs/research/CLONE_TRACKER.md` | 라우트별 구현 상태 |
| `docs/research/PAGE_TOPOLOGY.md`, `BEHAVIORS.md` | 공개 홈 섹션 구조와 인터랙션 스윕 |

## 실행

```bash
npm install

# better-sqlite3 는 네이티브 모듈이다. npm 전역 설정이 ignore-scripts=true 인 환경에서는 아래가 필요하다.
npm rebuild better-sqlite3 --ignore-scripts=false

npm run db:migrate   # 스키마 적용 (data/app.db 생성)
npm run db:seed      # 현실적인 시드 데이터
npm run dev          # http://localhost:3000
```

`npm run db:reset` 은 DB 파일을 지우고 마이그레이션 + 시드를 다시 실행합니다.

### 시드 로그인 계정

비밀번호는 모두 `password1234` 입니다. `/app/signin/` 에서 로그인합니다.

| 이메일 | 역할 | 확인할 수 있는 것 |
|---|---|---|
| `owner@example.com` | 소유자 | 전체 권한, 영구 삭제, 감사 로그 |
| `admin@example.com` | 관리자 | 멤버 관리, 감사 로그, 타인 소유 항목 수정 |
| `editor@example.com` | 편집자 | 본인 소유 항목만 수정·삭제, 영구 삭제 불가 |
| `viewer@example.com` | 조회자 | 읽기·내보내기만 가능 |

## CRUD 앱 화면

| 경로 | 화면 | 증거 등급 |
|---|---|---|
| `/app/home/` | 폴더 목록(카드/테이블 보기, 소유권·태그 필터, 검색) | `O` |
| `/app/site-audits/` | 사이트 감사 캠페인 | `P` |
| `/app/position-tracking/` | 순위 추적 캠페인 | `P` |
| `/app/keyword-lists/` | 키워드 목록 | `P` |
| `/app/media-lists/` | 미디어 리스트 | `P` |
| `/app/reports/` | 보고서 | `P` |
| `/app/content/` | 콘텐츠 문서 | `P` |
| `/app/trash/` | 휴지통(복구·영구 삭제) | `P` — 원본에 없음 |
| `/app/audit/` | 엔티티 감사 로그 | `P` — 원본 활동 로그는 인증 전용 |
| `/app/account/profile/` | 프로필 설정 | `O` |
| `/app/account/members/` | 사용자 관리 | `P` |
| `/app/account/notifications/` | 알림 설정(즉시 저장) | `O` |
| `/app/account/activities/` | 인증 활동 로그 | `O` |

`O` 직접 관찰 / `I1` 강한 추론 / `P` 안전한 재구축을 위한 제안. 각 화면 상단에 등급 배지가 표시됩니다.

## API

모든 도메인 리소스는 하나의 제네릭 라우트(`src/app/api/[resource]/`)를 통과하며,
정책은 `src/server/resource.ts` 한 곳에만 구현되어 있습니다.

```
GET    /api/{resource}/?q=&page=&pageSize=&sort=field:dir&scope=active|trashed|all&<filter>=
POST   /api/{resource}/
GET    /api/{resource}/{id}/
PATCH  /api/{resource}/{id}/            # version 을 함께 보내 낙관적 잠금
DELETE /api/{resource}/{id}/            # 소프트 삭제
DELETE /api/{resource}/{id}/?purge=1&code=NNNNNN   # 영구 삭제(admin+)
POST   /api/{resource}/{id}/restore/
POST   /api/{resource}/{id}/confirm-code/          # 영구 삭제 확인 코드 발급
POST   /api/{resource}/bulk/            # { action: "delete"|"restore", ids: [] }
GET    /api/{resource}/export/          # CSV
```

`resource` 는 `folders`, `sites`, `tags`, `site-audits`, `position-tracking`,
`keyword-lists`, `media-lists`, `reports`, `content` 입니다.

`trailingSlash: true` 설정 때문에 **API 경로는 반드시 후행 슬래시**로 호출해야 308 리다이렉트를 피할 수 있습니다.

응답 형식은 성공 `{ data, meta? }`, 실패 `{ error: { code, message, fields? } }` 입니다.
오류 코드: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `PLAN_LIMIT` 402, `FORBIDDEN` 403,
`NOT_FOUND` 404, `DUPLICATE`/`VERSION_CONFLICT`/`RELATION_RESTRICT` 409, `RATE_LIMITED` 429, `INTERNAL` 500.

## 검증

```bash
npm run build
PORT=4320 npx next start
node scripts/verify-crud.mjs http://localhost:4320
```

인증, 목록·검색·필터·정렬·페이지네이션, 생성·수정·삭제·복구·영구삭제, 필수값/형식/중복/버전 충돌,
역할 권한과 소유권, 관계 데이터 연쇄, 일괄 작업, CSV 내보내기, 감사 로그, 로그인 레이트 리밋까지
60개 항목을 검사합니다. 반복 실행이 가능하도록 생성 데이터는 실행마다 고유 접미사를 붙이고 끝에 정리합니다.

## 언어 전환

원본은 `ko.semrush.com` / `www.semrush.com` 처럼 서브도메인으로 언어를 나눕니다. 이 클론은 단일
호스트에서 동작하므로 **쿠키(`sc_locale`)로 로케일을 유지**하고 URL 은 그대로 둡니다. 246개 라우트를
언어별로 복제하지 않기 위한 선택이며, 원본과 다른 점입니다.

- 전환 지점: 푸터 언어 선택기 → `POST /api/locale/` → `router.refresh()`
- 지원 로케일: `en`, `ko`. 목록의 나머지 언어는 사전이 없어 비활성으로 표시하고 사유를 알려줍니다.
- 사전 범위: 헤더·푸터·인증 폼 등 **모든 페이지가 공유하는 셸 UI** (`src/i18n/dictionaries.ts`).
  페이지 본문 마케팅 카피는 영문 그대로입니다.

## 기술 스택

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 ·
Drizzle ORM + SQLite(better-sqlite3) · Zod · 자체 세션 인증(scrypt + httpOnly 쿠키)

## 원본과 의도적으로 다르게 만든 부분

1. 삭제는 **소프트 삭제 + 휴지통 + 관리자 영구 삭제**입니다. 원본 폴더 삭제는 복구 경로 없이 즉시 영구 삭제였습니다.
2. **엔티티 감사 로그**를 추가했습니다. 원본 활동 로그는 인증 이벤트만 기록합니다.
3. 성공 시 `aria-live` 상태 메시지를 노출합니다. 원본은 성공 토스트가 없습니다.
4. 잘못된 리소스 ID는 명시적 404 화면입니다. 원본은 상위 랜딩으로 폴백합니다.
5. 일괄 선택·일괄 삭제/복구를 추가했습니다. 원본 목록에는 선택 체크박스가 없습니다.
6. `version` 기반 낙관적 잠금으로 동시 수정 충돌을 409로 처리합니다.
7. 페이지네이션 파라미터를 전 화면 `page` 로 통일했습니다. 원본은 화면마다 `page`/`pageNumber` 가 섞여 있습니다.
