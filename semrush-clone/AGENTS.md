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

