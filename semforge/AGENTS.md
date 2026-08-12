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
  - SERP·순위·키워드 데이터 → **TalorData API** (`.env.local`의 `TALORDATA_API_TOKEN`, 클라이언트는 `src/server/talordata/`)
  - 사이트 크롤링 데이터 → **Firecrawl API** (`.env.local`의 `FIRECRAWL_API_KEY`, 클라이언트는 `src/server/siteaudit/firecrawl.ts`)
- 외부 API 호출 비용은 **사용자가 승인한 상태**다. "지금 순위 수집"/"지금 크롤" 같은 실비용 동작도 묻지 말고 실행해도 된다.
- 수집 실패 시에는 정직하게 오류/빈 상태를 표시하고, 가짜 숫자를 만들어 채우지 않는다. 수집 데이터는 출처(`source: "talordata"` 등)와 provenance 배지로 구분해 표시한다.
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

### [2026-08-12] 비밀 payload의 queue 종료 경계 (PostgreSQL, outbox, encryption)
- **상황**: 비밀번호 재설정 이메일을 AES-GCM 암호문으로 outbox/job에 보관하고 terminal 처리 뒤 제거하려 했다.
- **문제**: handler만 scrub하면 worker crash나 job 생성 전 relay DLQ 경로에서 암호문이 남고, 느슨한 envelope/key 제약은 평문 위장 payload를 허용할 수 있었다.
- **원인**: 애플리케이션 성공 경로만 정리 경계로 보고 outbox와 job의 독립적인 terminal 전환을 모두 모델링하지 않았다.
- **해결**: 전체 envelope 형식과 reset ID/idempotency key 관계를 DB 제약으로 강제하고, handler scrub 외에 outbox/job terminal trigger를 최종 정리 경계로 추가했다.
- **교훈**: 비밀을 담는 durable queue는 생산자·relay·consumer 각각의 crash terminal 경로를 열거하고 DB 수준 형식 검증과 멱등 scrub을 함께 둔다.
