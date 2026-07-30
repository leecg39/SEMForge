# SEMForge

SEMForge — SEO & AI 가시성 플랫폼. Semrush의 UI/UX를 관찰 기반으로 역설계해 재구축한 뒤,
모의 데이터를 전면 제거하고 **실제 외부 API 연동**으로 전환한 프로젝트입니다.

| 레이어 | 경로 | 성격 |
|---|---|---|
| 공개 사이트 | `/`, `/features/*`, `/pricing/*` 등 | 공개 사이트 구조/레이아웃 재현 |
| 로그인 앱 | `/home/`, `/seo/`, `/analytics/*`, `/siteaudit/`, `/position-tracking/`, `/ai-seo/*`, `/local-business/` 등 | **실데이터 기반 SEO 툴킷** |
| CRUD 앱 | `/app/*` + `/api/*` | 실제 DB·인증·권한·감사 로그가 있는 CRUD |

## 데이터 연동 원칙

- **실제 데이터는 항상 실제 외부 API로만 가져옵니다.** 모의/하드코딩 지표를 대신 쓰지 않습니다.
- 수집 실패 시 가짜 숫자를 만들지 않고 정직한 오류/빈 상태를 표시합니다.
- 지표에는 출처(provenance)를 구분해 표시합니다: `live`(실측) / `unavailable`(소스 없음).
- API 키는 코드·로그·스크린샷·커밋에 노출하지 않습니다 (`.env*`는 gitignore).

### 연결된 데이터 소스

| 소스 | 용도 | 환경 변수 | 비고 |
|---|---|---|---|
| **TalorData SERP** | 키워드 순위, SERP 피처(AI 개요·로컬팩 등), 도메인 실시간 수집 | `TALORDATA_API_TOKEN` | google/bing, gl/hl 지원 |
| **Firecrawl** | 사이트 진단 크롤 (없으면 자체 BFS 크롤러로 폴백) | `FIRECRAWL_API_KEY` | 선택 |
| **PageSpeed Insights** | 사이트 성능, Core Web Vitals (사이트 진단 테마 카드) | `PAGESPEED_API_KEY` | 선택, 없어도 저쿼터 동작 |
| **Google Search Console** | 소유 사이트의 클릭·노출·CTR·평균 포지션 (포지션 추적, 트래픽 개요) | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GSC_REDIRECT_URI` | OAuth 연결 필요 |
| **Google Business Profile** | 리스팅 위치, 리뷰 조회·답글 (지역 툴킷) | 위와 동일 + `GBP_REDIRECT_URI` | 별도 scope(`business.manage`) |

> 검색량·KD%·Authority Score·경쟁사 트래픽 추정처럼 현재 소스가 없는 지표는
> 가짜 값 대신 **미제공**으로 표시합니다. providers 레이어에 새 소스를 붙이면 바로 채워집니다.

## 실행

```bash
npm install

# better-sqlite3는 네이티브 모듈입니다. npm 전역 설정이 ignore-scripts=true 이면:
npm rebuild better-sqlite3 --ignore-scripts=false

npm run db:migrate   # 스키마 적용 (data/app.db 생성)
npm run db:seed      # 구조 시드 (데모 지표 없음. SEED_DEMO_DATA=1 시 데모 데이터 포함)
npm run dev          # http://localhost:3000
```

- **Node.js는 Homebrew v25(`/opt/homebrew/bin/node`)를 사용하세요.** 시스템 Node 22로 실행하면
  better-sqlite3 버전 불일치로 500 오류가 발생합니다. Node 버전을 바꾸면 `npm rebuild better-sqlite3`가 필요합니다.
- `npm run db:reset`은 DB 파일을 지우고 마이그레이션 + 시드를 다시 실행합니다.
- 로그인: `/login/`에서 `owner@example.com` / `password1234` (admin/editor/viewer도 동일 비밀번호).

### 환경 변수 (`.env.local`)

`.env.example`에 발급 방법이 주석으로 정리되어 있습니다.

```bash
TALORDATA_API_TOKEN=     # TalorData 대시보드에서 발급
FIRECRAWL_API_KEY=       # Firecrawl 대시보드에서 발급
PAGESPEED_API_KEY=       # (선택) Google Cloud 콘솔에서 발급
GOOGLE_CLIENT_ID=        # Google Cloud "웹 애플리케이션" OAuth 클라이언트
GOOGLE_CLIENT_SECRET=
GSC_REDIRECT_URI=        # 기본값 http://localhost:3000/api/gsc/callback
GBP_REDIRECT_URI=        # 기본값 http://localhost:3000/api/gbp/callback
CRON_SECRET=             # 주기 수집 엔드포인트 보호용 비밀값
```

## 주요 기능

| 영역 | 경로 | 실데이터 내용 |
|---|---|---|
| 홈 | `/home/` | 폴더 CRUD, 폴더별 실측 지표 |
| SEO 대시보드 | `/seo/` | 위젯 대시보드 (GSC 연결, AI 가시성 요약, 실측 배지만) |
| 도메인 개요 | `/analytics/overview/` | TalorData 실시간 수집 리포트 (무소스 지표는 미제공) |
| 포지션 추적 | `/position-tracking/` | 실시간 순위 수집, 순위 분포, 경쟁자 발견, GSC 컬럼, 주기 수집 |
| 사이트 진단 | `/siteaudit/` | 탭 5종(개요/문제/페이지/통계/테마), 테마 카드 9종(robots.txt AI 봇 판정 포함), PSI CWV, 스케줄 크롤 |
| AI 가시성 | `/ai-seo/overview/` | Google AI 개요 출현·자사 도메인 인용 여부 추적 (TalorData 실측) |
| 지역 | `/local-business/` | GBP 리스팅·리뷰·답글, 로컬팩 기반 지도 순위 추적 |
| 트래픽&시장 | `/analytics/traffic/` | GSC 기반 자사 검색 유입 (경쟁사 추정은 소스 없음으로 미제공) |

### 주기 수집 (스케줄 크롤/순위 수집)

서버 안에 상시 타이머를 두지 않고, 외부 cron/launchd가 엔드포인트를 주기 호출하는 구조입니다.

```bash
# 등록된 due 잡(사이트 진단 site_audit, 포지션 추적 position_tracking)을 실행
curl -H "x-cron-secret: $CRON_SECRET" "http://localhost:3000/api/cron/run-due"
curl -H "x-cron-secret: $CRON_SECRET" "http://localhost:3000/api/cron/run-due?only=site_audit&limit=10"
```

캠페인별 스케줄(없음/매일/매주)은 각 도구의 설정 화면에서 지정합니다.

## API 규약

모든 도메인 리소스는 하나의 제네릭 라우트(`src/app/api/[resource]/`)를 통과하며,
정책은 `src/server/resource.ts` 한 곳에 구현되어 있습니다.

```
GET    /api/{resource}/?q=&page=&pageSize=&sort=field:dir&scope=active|trashed|all&<filter>=
POST   /api/{resource}/
GET    /api/{resource}/{id}/
PATCH  /api/{resource}/{id}/            # version을 함께 보내 낙관적 잠금
DELETE /api/{resource}/{id}/            # 소프트 삭제
POST   /api/{resource}/{id}/restore/
POST   /api/{resource}/bulk/            # { action: "delete"|"restore", ids: [] }
GET    /api/{resource}/export/          # CSV
```

`trailingSlash: true` 설정 때문에 **API 경로는 반드시 후행 슬래시**로 호출해야 합니다.

응답 형식은 성공 `{ data, meta? }`, 실패 `{ error: { code, message, fields? } }` 입니다.
외부 데이터 프록시(`GET /api/psi`, `GET /api/gsc/query`)는 `ProviderResult`
봉투(`{ status: "live"|"unavailable"|"error", data?, reason? }`)로 응답합니다.

## 검증

```bash
npx tsc --noEmit        # 타입 검사
npm run lint            # ESLint
npm run test:talordata  # TalorData 클라이언트/수집
npm run test:analytics  # 분석 지표 순수 함수
npm run test:siteaudit  # 사이트 진단 링크 그래프
npx tsx --test src/server/position-tracking/*.test.ts  # 순위 분포/스케줄
```

## 언어 전환

단일 호스트에서 동작하므로 **쿠키(`sc_locale`)로 로케일을 유지**하고 URL은 그대로 둡니다.
지원 로케일은 `en`, `ko`이며 런타임 외부 번역 호출은 없습니다.

## 기술 스택

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 ·
Drizzle ORM + SQLite(better-sqlite3) · Zod · 자체 세션 인증(scrypt + httpOnly 쿠키)

## 관련 문서

| 문서 | 내용 |
|---|---|
| `.Codex/progress.txt` | 작업 상태 체크포인트 (커밋 제외) |
| `docs/research/APP_CRUD_EVIDENCE.md` | 로그인 앱 CRUD 실측 증거 |
| `docs/research/APP_REBUILD_SPEC.md` | 재구축 명세(ERD·필드·API·정책) |

## 원본과 의도적으로 다르게 만든 부분

1. **모의 데이터가 없습니다.** 원본 클론 시절의 데모 지표를 전면 제거하고, 소스가 없는 지표는 미제공으로 표시합니다.
2. 삭제는 **소프트 삭제 + 휴지통 + 관리자 영구 삭제**입니다.
3. **엔티티 감사 로그**를 추가했습니다.
4. `version` 기반 낙관적 잠금으로 동시 수정 충돌을 409로 처리합니다.
5. Google OAuth(GSC/GBP) 연동으로 소유 사이트의 실측 데이터를 직접 가져옵니다.
