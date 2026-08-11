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
| **NAVER Search Ads** | 연관 키워드, PC·모바일 월간 검색수, 광고 클릭·CTR·경쟁도 | `NAVER_SEARCH_AD_ACCESS_LICENSE` / `NAVER_SEARCH_AD_SECRET_KEY` / `NAVER_SEARCH_AD_CUSTOMER_ID` | 서버 전용 공용 계정, 7일 캐시 |
| **NAVER API HUB** | 최근 12개월 상대 Search Trend, Blog Search 결과 수·응답 예시 | `NAVER_API_HUB_CLIENT_ID` / `NAVER_API_HUB_CLIENT_SECRET` | 서버 전용, Trend 7일·Blog 24시간 캐시 |
| **Bing Webmaster** | 인증된 소유 사이트의 링크된 페이지·인바운드 링크 | `BING_WEBMASTER_CLIENT_ID` / `BING_WEBMASTER_CLIENT_SECRET` | 읽기 전용 OAuth, 24시간 캐시 |
| **Common Crawl** | Bing 빈 결과 보완 및 공개 웹 백링크 자동 탐색 | `COMMON_CRAWL_BACKLINK_ENDPOINT` | Web Graph/WARC 역색인 게이트웨이, 30일 캐시 |
| **Ahrefs 무료 DR** | 인증 사이트의 Domain Rating | `AHREFS_API_KEY` | 서버 전용 Bearer 인증, 출처 링크 필수 표시 |
| **Firecrawl** | 사이트 진단 크롤 (없으면 자체 BFS 크롤러로 폴백) | `FIRECRAWL_API_KEY` | 선택 |
| **PageSpeed Insights** | 사이트 성능, Core Web Vitals (사이트 진단 테마 카드) | `PAGESPEED_API_KEY` | 선택, 없어도 저쿼터 동작 |
| **ChatMock** | 광고 문구·Markdown 기사와 대표 이미지의 구조화된 시각 명세 생성 | `CHATMOCK_BASE_URL` / `CHATMOCK_ADVERTISING_MODEL` / `CHATMOCK_CONTENT_MODEL` | OpenAI API 키 불필요, 로컬 프록시 실행 필요 |
| **xAI** | Grok 4.5 기사·영상 콘티와 Grok Imagine 영상 장면 생성 | `XAI_API_KEY` / `XAI_CONTENT_MODEL` / `XAI_VIDEO_MODEL` | 영상에는 필요 |
| **Gemini API** | 콘텐츠 작업판의 Gemini 3.5 Flash 기사 생성 | `GEMINI_API_KEY` | 선택 |
| **Google Search Console** | 소유 사이트의 클릭·노출·CTR·평균 포지션 (포지션 추적, 트래픽 개요) | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GSC_REDIRECT_URI` | OAuth 연결 필요 |
| **Google Business Profile** | 리스팅 위치, 리뷰 조회·답글 (지역 툴킷) | 위와 동일 + `GBP_REDIRECT_URI` | 별도 scope(`business.manage`) |

> 검색량·KD%·경쟁사 트래픽 추정처럼 현재 소스가 없는 지표는
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

광고 AI와 콘텐츠의 기본 GPT-5.6 Luna 모델은 [ChatMock](https://github.com/RayBytes/chatmock)으로 인증된 ChatGPT 계정을 사용합니다.
콘텐츠 작업판에서는 `XAI_API_KEY` 또는 `GEMINI_API_KEY`를 설정하면 Grok 4.5와 Gemini 3.5 Flash도 선택할 수 있습니다.
최초 한 번 로그인한 뒤 SEMForge와 별도 터미널에서 프록시를 실행하세요.

```bash
brew tap RayBytes/chatmock
brew install chatmock
npm run chatmock:login
npm run chatmock:serve  # 기본 http://127.0.0.1:8000/v1
```

기사 비주얼은 ChatMock이 기사 문맥에서 구조화된 색상·구도 명세를 만들고, 서버의 Sharp 렌더러가 원본 WebP와 썸네일(1280×720)·OG(1200×630)를 생성합니다. ChatMock 자체가 이미지 출력을 제공하지 않으므로 한글 제목과 브랜드 로고는 서버가 정확하게 합성하며, 파일은 `CONTENT_ASSET_ROOT`(기본 `data/content-assets/`)에 저장됩니다. `npm run db:backup`은 SQLite와 이 자산 디렉터리를 함께 백업합니다.

영상 제작은 `Grok 4.5 콘티 → 사용자 승인 → Grok 시각 명세 + Sharp 키프레임 → 사용자 비용 승인 → Grok Imagine 장면 생성 → FFmpeg MP4 조립` 순서입니다. 영상 경로는 하나의 `XAI_API_KEY`만 사용하며, 키프레임은 서버의 결정적 렌더러가 만들고 xAI 결과 URL은 완료 즉시 로컬 자산 저장소로 내려받습니다. FFmpeg와 FFprobe가 PATH에 없으면 `FFMPEG_PATH`와 `FFPROBE_PATH`를 지정해야 합니다.

- **Node.js는 Homebrew v25(`/opt/homebrew/bin/node`)를 사용하세요.** 시스템 Node 22로 실행하면
  better-sqlite3 버전 불일치로 500 오류가 발생합니다. Node 버전을 바꾸면 `npm rebuild better-sqlite3`가 필요합니다.
- `npm run db:reset`은 DB 파일을 지우고 마이그레이션 + 시드를 다시 실행합니다.
- 로그인: `/login/`에서 `owner@example.com` / `password1234` (admin/editor/viewer도 동일 비밀번호).

### 환경 변수 (`.env.local`)

`.env.example`에 발급 방법이 주석으로 정리되어 있습니다.

```bash
TALORDATA_API_TOKEN=     # TalorData 대시보드에서 발급
NAVER_API_HUB_CLIENT_ID= # NAVER API HUB 신규 키
NAVER_API_HUB_CLIENT_SECRET=
NAVER_SEARCH_AD_ACCESS_LICENSE= # NAVER Search Ads 공용 계정
NAVER_SEARCH_AD_SECRET_KEY=
NAVER_SEARCH_AD_CUSTOMER_ID=
PUBLIC_RATE_LIMIT_SECRET= # 공개 미리보기 쿠키/IP-prefix HMAC 키(운영 32자 이상)
NAVER_KEYWORD_INTELLIGENCE_ENABLED=false
PUBLIC_NAVER_KEYWORD_PREVIEW_ENABLED=false
NAVER_SEARCH_AD_DAILY_BUDGET=1000
NAVER_API_HUB_DAILY_BUDGET=10000
BING_WEBMASTER_CLIENT_ID=     # Bing Webmaster OAuth 앱
BING_WEBMASTER_CLIENT_SECRET=
BING_WEBMASTER_REDIRECT_URI=  # 기본값 http://localhost:3000/api/bing-webmaster/callback
AHREFS_API_KEY=                # Ahrefs 무료 Domain Rating API 키
COMMON_CRAWL_BACKLINK_ENDPOINT= # Common Crawl Web Graph/WARC 역색인 게이트웨이(HTTPS)
COMMON_CRAWL_BACKLINK_TOKEN=    # 선택적 서버 전용 Bearer 토큰
CHATMOCK_BASE_URL=       # 기본값 http://127.0.0.1:8000/v1
CHATMOCK_ADVERTISING_MODEL=gpt-5.4
CHATMOCK_CONTENT_MODEL=gpt-5.6-luna
CHATMOCK_CONTENT_TIMEOUT_MS=270000 # xHigh 장문 생성 제한(30~300초)
XAI_API_KEY=             # (선택) Grok 4.5 콘텐츠 생성
XAI_CONTENT_MODEL=grok-4.5
XAI_VIDEO_MODEL=grok-imagine-video-1.5
GEMINI_API_KEY=          # (선택) Gemini 3.5 Flash 콘텐츠 생성
CONTENT_ASSET_ROOT=      # 기본값 data/content-assets/
FFMPEG_PATH=             # 미설정 시 PATH의 ffmpeg
FFPROBE_PATH=            # 미설정 시 PATH의 ffprobe
FIRECRAWL_API_KEY=       # Firecrawl 대시보드에서 발급
PAGESPEED_API_KEY=       # (선택) Google Cloud 콘솔에서 발급
GOOGLE_CLIENT_ID=        # Google Cloud "웹 애플리케이션" OAuth 클라이언트
GOOGLE_CLIENT_SECRET=
GSC_REDIRECT_URI=        # 기본값 http://localhost:3000/api/gsc/callback
GBP_REDIRECT_URI=        # 기본값 http://localhost:3000/api/gbp/callback
CRON_SECRET=             # 주기 수집 엔드포인트 보호용 비밀값
APP_SECRET=              # OAuth 토큰 at-rest 암호화 키 재료 (미설정 시 평문 저장 + 경고)
SNAPSHOT_RETENTION_DAYS= # 스냅샷 보존 일수 (기본 90, db_retention job)
```

### Common Crawl 백링크 게이트웨이 계약

Common Crawl의 공개 URL Index는 URL별 캡처 위치를 찾는 API이며, 대상 도메인의 인바운드 링크를
역방향으로 바로 조회하는 API는 아닙니다. 따라서 `COMMON_CRAWL_BACKLINK_ENDPOINT`에는 공식
Web Graph/WARC를 미리 역색인한 서버 엔드포인트를 연결해야 합니다. 애플리케이션은 이 엔드포인트에
다음 JSON을 `POST`하고, 반환된 실제 링크만 정규화·중복 제거해 저장합니다.

```json
{
  "siteUrl": "https://example.com/",
  "targetUrl": null,
  "scope": "site",
  "limit": 500,
  "recentCrawls": 3,
  "verifyWarcLinks": true
}
```

```json
{
  "release": "cc-main-YYYY-release",
  "rows": [
    {
      "sourceUrl": "https://source.example/article",
      "targetUrl": "https://example.com/page",
      "anchor": "example",
      "linkCount": 1
    }
  ],
  "partial": true,
  "warning": null,
  "requestId": "optional-request-id"
}
```

운영 환경에서는 HTTPS가 필수이며, `COMMON_CRAWL_BACKLINK_TOKEN`을 설정하면 서버가 Bearer 인증을
사용합니다. 게이트웨이가 설정되지 않은 환경에서는 유료 호출이나 임의 데이터를 만들지 않고
설정 필요 상태를 표시합니다. Common Crawl 결과는 릴리스와 부분 수집 여부를 함께 보존하며 30일간
캐시합니다.

## 주요 기능

| 영역 | 경로 | 실데이터 내용 |
|---|---|---|
| 홈 | `/home/` | 폴더 CRUD, 폴더별 실측 지표 |
| SEO 대시보드 | `/seo/` | 위젯 대시보드 (GSC 연결, AI 가시성 요약, 실측 배지만) |
| 도메인 개요 | `/analytics/overview/` | TalorData 실시간 수집 리포트 (무소스 지표는 미제공) |
| NAVER 키워드 개요 | `/analytics/keywordoverview/`의 NAVER 탭 | Search Ads·Search Trend·Blog Search를 섹션별 출처/캐시와 함께 표시 |
| 한국형 키워드 탐색기 | `/analytics/keywordmagic/` | 최대 5개 seed, 1,000개 연관어, CSV·목록 저장·콘텐츠/광고 handoff |
| 무료 NAVER 검색량 | `/free-tools/keyword-search-volume-checker/` | 비로그인 서로 다른 키워드 3개/24시간, 실제 공급자 데이터만 표시 |
| 백링크 분석 | `/analytics/backlinks/overview/` | Bing 우선 조회·Common Crawl 자동 보완·Ahrefs DR·공급자별 캐시 |
| 백링크 갭 | `/analytics/gap/backlinks/` | Common Crawl/CSV URL 데이터셋 기반 경쟁 추천 도메인 비교 |
| 포지션 추적 | `/position-tracking/` | 실시간 순위 수집, 순위 분포, 경쟁자 발견, GSC 컬럼, 주기 수집 |
| 사이트 진단 | `/siteaudit/` | 탭 5종(개요/문제/페이지/통계/테마), 테마 카드 9종(robots.txt AI 봇 판정 포함), PSI CWV, 스케줄 크롤 |
| AI 가시성 | `/ai-seo/overview/` | Google AI 개요 출현·자사 도메인 인용 여부 추적 (TalorData 실측) |
| 콘텐츠 | `/content/` | 글·이미지·영상 제작, ChatMock 시각 명세, Grok 콘티·영상 장면, 자동 저장·재개 |
| 지역 | `/local-business/` | GBP 리스팅·리뷰·답글, 로컬팩 기반 지도 순위 추적 |
| 트래픽&시장 | `/analytics/traffic/` | Airbyte GA4·GSC 통합 성과 + 기존 GSC 실시간 폴백 |

### 주기 수집 (스케줄 크롤/순위 수집)

서버 안에 상시 타이머를 두지 않고, 외부 cron/launchd가 엔드포인트를 주기 호출하는 구조입니다.

```bash
# 등록된 due 잡(사이트 진단, 포지션 추적, 콘텐츠 미디어)을 실행
curl -H "x-cron-secret: $CRON_SECRET" "http://localhost:3000/api/cron/run-due"
curl -H "x-cron-secret: $CRON_SECRET" "http://localhost:3000/api/cron/run-due?only=site_audit&limit=10"
curl -H "x-cron-secret: $CRON_SECRET" "http://localhost:3000/api/cron/run-due?only=content_media_due&limit=10"
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
npm run verify          # ESLint + 타입 검사 + 전체 .test.ts
npm run typecheck       # 타입 검사
npm run lint            # ESLint
npm run test:talordata  # TalorData 클라이언트/수집
npm run test:naver      # NAVER 공급자·캐시·API·UI·handoff 계약
npm run test:marketing  # Airbyte Adapter·Postgres 마트·귀속·신선도 계약
npm run test:analytics  # 분석 지표 순수 함수
npm run test:siteaudit  # 사이트 진단 링크 그래프
npm run test:backlinks  # Bing·Common Crawl·Ahrefs·캐시·URL 범위 계약
npm run test:content    # 글·이미지·영상 콘텐츠 계약과 실행
npx tsx --test src/server/position-tracking/*.test.ts  # 순위 분포/스케줄
```

반복 검증 루프는 `npm run loop:bootstrap`, `npm run loop:verify`,
`npm run loop:smoke`로 실행하며 세부 절차는 `docs/loop-engineering.md`를 따릅니다.

## 언어 전환

단일 호스트에서 동작하므로 **쿠키(`sc_locale`)로 로케일을 유지**하고 URL은 그대로 둡니다.
지원 로케일은 `en`, `ko`이며 런타임 외부 번역 호출은 없습니다.

## 기술 스택

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 ·
Drizzle ORM + SQLite(better-sqlite3) · Zod · 자체 세션 인증(scrypt + httpOnly 쿠키)

## 관련 문서

| 문서 | 내용 |
|---|---|
| `docs/DB_SCHEMA.md` | 데이터베이스 설계 (ERD, 테이블 사전, 보존 정책, 마이그레이션 규약) |
| `.Codex/progress.txt` | 작업 상태 체크포인트 (커밋 제외) |
| `docs/research/APP_CRUD_EVIDENCE.md` | 로그인 앱 CRUD 실측 증거 |
| `docs/research/APP_REBUILD_SPEC.md` | 재구축 명세(ERD·필드·API·정책) |

## 원본과 의도적으로 다르게 만든 부분

1. **모의 데이터가 없습니다.** 원본 클론 시절의 데모 지표를 전면 제거하고, 소스가 없는 지표는 미제공으로 표시합니다.
2. 삭제는 **소프트 삭제 + 휴지통 + 관리자 영구 삭제**입니다.
3. **엔티티 감사 로그**를 추가했습니다.
4. `version` 기반 낙관적 잠금으로 동시 수정 충돌을 409로 처리합니다.
5. Google OAuth(GSC/GBP) 연동으로 소유 사이트의 실측 데이터를 직접 가져옵니다.
