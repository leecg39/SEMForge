<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 실행 환경

- 개발 서버는 **Homebrew Node v25**로 실행해야 한다. 기본 PATH의 Node v22로 띄우면 `better-sqlite3` 네이티브 모듈 버전 불일치로 `/home/` 등이 500 오류를 반환한다.
- Node 버전을 바꿔 쓰려면 `npm rebuild better-sqlite3`로 해당 버전에 맞게 재컴파일할 것.
- 브라우저 자동화는 ego-browser(ego-lite)가 기본이다.

# 데이터 연동 원칙 (사용자 지침, 2026-07-29)

- **실제 데이터는 항상 실제 외부 API로 연동한다.** 모의/하드코딩 데이터를 대신 쓰지 않는다.
  - SERP·순위·키워드 데이터 → **TalorData API** (`.env.local`의 `TALORDATA_API_TOKEN`, 클라이언트는 `src/server/talordata/`)
  - 사이트 크롤링 데이터 → **Firecrawl API** (`.env.local`의 `FIRECRAWL_API_KEY`, 클라이언트는 `src/server/siteaudit/firecrawl.ts`)
- 외부 API 호출 비용은 **사용자가 승인한 상태**다. "지금 순위 수집"/"지금 크롤" 같은 실비용 동작도 묻지 말고 실행해도 된다.
- 수집 실패 시에는 정직하게 오류/빈 상태를 표시하고, 가짜 숫자를 만들어 채우지 않는다. 수집 데이터는 출처(`source: "talordata"` 등)와 provenance 배지로 구분해 표시한다.
- API 키는 코드·로그·스크린샷·커밋에 노출하지 않는다 (`.env*`는 gitignore).

## Cursor Cloud specific instructions

이 절은 이미 업데이트 스크립트(`npm install --prefix semforge` + `better-sqlite3`/`sharp` rebuild)가 실행된 Cloud VM에서 시작하는 향후 에이전트를 위한 것이다.

- 앱은 `semforge/` 안에 있다. 모든 명령은 `semforge/`에서 실행한다.
- **Node 버전:** 이 Linux Cloud VM에서는 기본 Node **v22**를 그대로 쓴다. README/위쪽의 "Homebrew Node v25" 안내는 macOS 전용이며 여기서는 무시한다. `better-sqlite3`·`sharp` 네이티브 모듈은 설치와 실행에 같은 Node를 쓰는 한 v22에서 정상 동작한다. Node 버전을 바꾼 경우에만 `npm rebuild better-sqlite3 sharp`가 필요하다.
- **DB 초기화 (fresh VM 필수):** SQLite DB는 `semforge/data/app.db`이며 gitignore라 새 VM에는 없다. 업데이트 스크립트는 마이그레이션을 실행하지 않으므로, 개발 전에 한 번 초기화한다: `npm run db:migrate && npm run db:seed` (또는 처음부터 다시 만들려면 `npm run db:reset`). 시드가 로그인 계정과 폴더/캠페인 구조를 만든다.
- **환경 변수:** 개발에는 `semforge/.env.local`이 필요하다. 외부 API 키(TalorData·Semrush·ChatMock·XAI·Gemini·Google OAuth·PageSpeed·Firecrawl)는 **모두 선택**이며, 없으면 해당 기능이 설계대로 정직한 "미제공/빈 상태"를 표시한다. OAuth 토큰 암호화를 위해 임의의 긴 문자열을 `APP_SECRET`에 넣으면 평문 저장 경고가 사라진다. `/app/*` CRUD 앱과 제네릭 `/api/[resource]/`는 외부 키 없이 완전히 로컬로 동작한다.
- **로그인 계정 (시드, 공통 비밀번호 `password1234`):** `owner@example.com`, `admin@example.com`, `editor@example.com`, `viewer@example.com`. CRUD 클론 로그인은 `/app/signin/`, 메인 앱 로그인은 `/login/`.
- **실행:** `npm run dev` → http://localhost:3000 (Next.js 16 Turbopack). `trailingSlash: true`라 **API 경로는 반드시 후행 슬래시**로 호출한다 (예: `/api/keyword-lists/`).
- **검증:** `npm run lint`(경고만, 에러 0)와 `test:*` 스크립트(`test:analytics`, `test:content` 등, README 검증 절 참고)는 모두 통과한다. 단, `npx tsc --noEmit`은 setup과 무관한 기존 타입 에러(`RouteContext` 자동 생성 타입, `repurpose.test.ts` 1건)를 보고하므로 이를 setup 실패로 오해하지 말 것.

