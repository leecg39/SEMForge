<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 실행 환경

- 개발·CI·프로덕션은 **Node 24 LTS**로 통일한다. `package.json`의 engines 범위를 벗어난 Node 버전으로 검증하지 않는다.
- 데이터베이스는 PostgreSQL 16 전용이다. SQLite 및 `better-sqlite3`를 추가하거나 호환 계층을 만들지 않는다.
- 브라우저 자동화는 ego-browser(ego-lite)가 기본이다.

# 데이터 연동 원칙 (사용자 지침, 2026-07-29)

- **실제 데이터는 항상 실제 외부 API로 연동한다.** 모의/하드코딩 데이터를 대신 쓰지 않는다.
  - Google 순위·AI Overview → **TalorData API** (`TALORDATA_API_TOKEN`, `src/server/talordata/`)
  - Google Search Console → readonly OAuth와 `src/server/collectors/gsc/`
  - NAVER 수요·추이·인구통계·블로그 결과 규모 → 공식 Search Ads/Open API와 `src/server/providers/naver/`
- 외부 API 호출은 가입 후 최초 수집 1회와 주간 예약 수집만 허용한다. 임의 수동 새로고침이나 삭제된 사이트 감사·크롤 기능을 추가하지 않는다.
- 수집 실패 시에는 정직하게 오류/빈/부분 상태를 표시하고, 가짜 숫자를 만들어 채우지 않는다. 수집 데이터는 공급자와 provenance를 보존한다.
- API 키는 코드·로그·스크린샷·커밋에 노출하지 않는다 (`.env*`는 gitignore).

# Lessons Learned

### [2026-08-11] nullable child와 tenant composite FK 삭제 정책 (PostgreSQL, FK, tenancy)
- **상황**: 관측값이 선택적 provider call을 같은 workspace 안에서만 참조하도록 복합 FK를 설계했다.
- **문제**: `(workspace_id, provider_call_id) ON DELETE SET NULL`은 PostgreSQL이 두 컬럼을 모두 NULL로 만들기 때문에 `workspace_id NOT NULL`과 충돌한다.
- **원인**: 복합 FK의 기본 `SET NULL` 대상은 nullable child 컬럼 하나가 아니라 FK 전체 컬럼이다.
- **해결**: append-only 관측값의 FK를 `ON DELETE RESTRICT`로 고정하고, site/query/type도 하나의 복합 FK로 묶었다.
- **교훈**: tenant key가 포함된 복합 FK에는 전체 `SET NULL`을 사용하지 말고 RESTRICT/CASCADE 또는 명시적 column-list SQL을 선택한다.

### [2026-08-12] jsonb canonical hash와 generated column (PostgreSQL, idempotency, migration)
- **상황**: job/outbox 요청의 중요 필드를 DB에서 canonical SHA-256으로 고정하려 했다.
- **문제**: `jsonb::text`가 들어간 generated column은 PostgreSQL 16에서 expression immutable 오류로 거부됐다.
- **원인**: PostgreSQL은 stored generated expression 전체가 immutable이길 요구하지만 `jsonb`의 text 변환은 immutable로 선언되지 않았다.
- **해결**: BEFORE INSERT/UPDATE trigger가 정규화된 `jsonb::text`와 주요 필드로 `request_hash`를 항상 덮어쓰도록 만들었다.
- **교훈**: PostgreSQL canonical serialization을 generated column에 넣기 전 함수 volatility를 확인하고, DB 강제가 필요하면 trigger와 drift 테스트를 함께 사용한다.
