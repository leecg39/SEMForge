# Content Workspace 단순화·고도화 계획

## 1. 목표

첨부 영상에서 확인한 대화형 Content Toolkit의 장점을 SEMForge에 적용하되, 화면과 메뉴를 그대로 복제하지 않는다. SEMForge의 실제 데이터 원칙과 기존 자산을 살려 다음 한 문장으로 제품을 재구성한다.

> 사용자는 `/content/`의 한 입력창에서 작업을 시작하고, 하나의 작업판에서 필요한 조건만 확인한 뒤, 실제 데이터에 근거한 콘텐츠를 생성·개선·재활용하고, 결과를 저장·재개한다.

핵심 정리:

- 화면은 `홈`, `작업판`, `라이브러리` 3개로 줄인다.
- 모든 흐름은 `Content Board` 하나를 중심으로 연결한다.
- 첫 번째 릴리스는 `기사 생성` 세로 슬라이스를 완성한다.
- 최적화·재활용·브리프는 같은 작업판에 후속 모드로 추가한다.
- 소셜 게시물·이미지 생성은 기반이 마련된 뒤 확장한다.

## 2. 영상 분석 결과

영상 길이: 4분 52.8초, 1988×1118.

| 구간 | 관찰된 흐름 | 적용할 원칙 |
| --- | --- | --- |
| 00:00–00:20 | Topic Finder에서 Content Dashboard로 이동하고, 한 입력창이 기사·브리프·이미지·소셜·최적화·재활용 의도를 제안 | 여러 도구의 첫 화면을 하나의 명령 입력창으로 통합 |
| 00:25–01:05 | 작업판으로 전환되고 왼쪽 대화 패널에서 플랫폼·주제·톤·형식을 필요한 순서대로 선택 | 처음부터 긴 폼을 보여주지 않고 필요한 조건만 점진적으로 공개 |
| 01:10–01:45 | 실제 생성 단계가 체크리스트로 진행되고 결과 카드가 작업판에 등장 | 진행률 숫자를 꾸미지 않고 실제 서버 단계와 결과 상태를 노출 |
| 01:50–02:40 | 생성 결과를 열고 이미지 포함 결과를 확인하며, 하단 입력창에서 후속 요청 가능 | 생성 완료가 끝이 아니라 같은 문맥에서 수정·공유·재사용으로 연결 |
| 02:45–03:05 | 대시보드로 돌아오면 최근 작업판이 남아 있음 | 최근 작업을 홈에서 즉시 재개 가능하게 구성 |
| 03:10–04:15 | 기사 생성은 주제를 먼저 묻고, 추천 제목·키워드·분량·브랜드 보이스를 자동 제안하며 고급 설정은 접음 | 추천값 우선, 고급 설정 후순위, 생성 직전 한 번의 확인 |
| 04:20–04:52 | 기존 글 최적화에서 URL 가져오기 또는 직접 입력 중 하나를 선택 | 최적화는 URL 수집과 직접 붙여넣기를 동일한 작업 모델로 처리 |

영상에서 가져오지 않을 부분:

- 드래그·줌이 가능한 무한 캔버스는 1차 범위에 넣지 않는다. 고정형 반응형 작업판으로도 핵심 가치가 충분하다.
- 여섯 기능을 다시 여섯 개의 독립 제품으로 만들지 않는다.
- 실제 서버 단계와 연결되지 않은 가짜 진행 애니메이션을 만들지 않는다.
- 이미지·소셜 생성은 기존 서버 계약과 데이터 모델이 없는 상태에서 기사 생성과 동시에 묶지 않는다.

## 3. 현재 SEMForge와의 차이

### 현재 확보된 자산

- `AppShell`은 전역 레일, 툴킷 사이드바, 본문을 이미 분리하며 `hideSideNav`도 지원한다.
- `ToolkitSideNav`는 프로젝트 폴더를 실제 `/api/folders/`에서 읽고, 선택한 `fid`를 일부 툴킷 링크에 전달한다.
- `content_articles`에는 폴더, 생성 모드, 상태, 키워드, 본문, 단어 수, SEO 점수 필드가 있다.
- 일반 CRUD 엔드포인트 `/api/content`가 콘텐츠 문서의 목록·생성·수정·삭제 기반을 제공한다.
- ChatMock Responses 호출 패턴, TalorData 클라이언트, Firecrawl 공용 클라이언트, 인증·감사 로그·API 오류 규약이 이미 있다.

### 현재 사용자 경험의 문제

1. `/content/`는 제목·설명·정적 카드 3개만 보여 주며 시작 액션이 없다.
2. 콘텐츠 기능이 사이드바의 7개 링크와 여러 독립 페이지로 분리되어 문맥이 끊긴다.
3. `AppEditorTemplate`의 Generate, Save, Publish는 실제 실행·저장 흐름과 연결되지 않는다.
4. `My Content`는 실제 `content_articles` CRUD 대신 일반 빈 상태 템플릿을 보여 준다.
5. Topic Finder는 TalorData와 연결되지 않아 연구 결과를 기사 생성으로 넘길 수 없다.
6. 1904×947에서 전역 레일 72px + 툴킷 사이드바 240px를 제외한 본문 1592px 대부분이 비어 있다.
7. 콘텐츠 작업 이력, 대화 문맥, 실행 상태, 실패 이유를 저장할 모델이 없다.

## 4. 목표 정보 구조

### Content 사이드바

기존 7개 링크를 다음 3개로 줄인다.

1. `Content Home` — 새 작업 시작 + 최근 작업판
2. `Workspaces` — 진행 중·완료·실패 작업 필터
3. `Library` — 저장된 기사·브리프·파생 콘텐츠

기존 도구 링크는 삭제하지 않고 호환 리다이렉트를 둔다.

| 기존 URL | 새 진입점 |
| --- | --- |
| `/content/articles/create/` | `/content/?intent=create` |
| `/content/articles/optimize/` | `/content/?intent=optimize` |
| `/content/articles/repurpose/` | `/content/?intent=repurpose` |
| `/content/briefs/create/` | `/content/?intent=brief` |
| `/content/topic-finder/` | `/content/?intent=topic` |
| `/content/articles/` | `/content/library/` 또는 기존 URL을 라이브러리의 정식 URL로 유지 |

### 세 작업 표면

#### A. Content Home

- 한 줄 명령 입력: “무엇을 만들거나 개선할까요?”
- 1차 의도 칩: `새 글 작성`, `기존 글 개선`, `다른 형식으로 재활용`
- 보조 메뉴: `주제 찾기`, `SEO 브리프`
- 선택한 폴더/도메인 문맥 표시
- 최근 작업판 5개: 상태, 마지막 산출물, 수정 시각, 재개 버튼
- 데이터 공급자 상태: TalorData, Firecrawl, AI 생성 사용 가능 여부

#### B. Workspaces / Content Board

- `/content/workspaces/`는 진행 중·완료·실패 작업판의 검색·필터 목록을 제공한다.
- `/content/workspaces/[boardId]/`는 선택한 작업판의 대화와 산출물을 연다.
- 이 라우트에서는 `ToolkitSideNav`를 숨겨 3중 사이드바를 방지한다.
- 전역 레일 72px는 유지하고, 본문 내부에 320–360px 대화 패널과 유동 캔버스를 둔다.
- 1904px 기준 예상 작업 폭: 전역 레일 72px + 대화 패널 340px + 결과 캔버스 약 1492px.
- 왼쪽: 요청, 필요한 질문, 추천 설정, 실제 진행 단계, 후속 입력.
- 중앙: 기사·브리프·분석 결과 카드와 편집기.
- 오른쪽 검사 패널은 항상 노출하지 않고 `SEO 검사`를 열었을 때만 표시.
- 모바일에서는 대화 패널을 드로어로 전환하고 결과를 우선 표시.

#### C. Library

- 기존 `content_articles` 실제 목록 사용.
- 상태, 모드, 프로젝트, 키워드, 최근 수정 기준 필터.
- 작업판으로 돌아가기, 복제, 최적화 시작, 재활용 시작 액션.
- 빈 상태는 샘플 수치 대신 첫 작업 시작 CTA만 제공.

## 5. 핵심 상호작용

```mermaid
flowchart LR
    A["홈 명령 입력"] --> B["의도 판별"]
    B --> C["빠진 조건 1개씩 확인"]
    C --> D["추천 설정 요약"]
    D --> E["실제 실행 시작"]
    E --> F["수집·연구·생성 단계 기록"]
    F --> G["산출물 저장"]
    G --> H["편집·후속 요청·최적화·재활용"]
    H --> F
```

진행 단계는 모드별 실제 서버 단계에 대응한다.

- 기사 생성: `요청 검증 → 키워드/SERP 연구 → 소스 문맥 구성 → AI 초안 생성 → 규칙 기반 검사 → 저장`
- 최적화: `URL/본문 확인 → Firecrawl 수집 또는 직접 입력 → 경쟁 문서 연구 → 개선안 생성 → 점수 재계산 → 저장`
- 재활용: `원문 확인 → 대상 형식 확인 → 변환 → 길이/채널 규칙 검사 → 저장`
- 브리프: `키워드 확인 → TalorData 연구 → 검색 의도/경쟁 문서 구조화 → 브리프 저장`

## 6. 데이터와 서버 설계

### 최소 데이터 모델

기존 `content_articles`를 버리지 않고 산출물 저장소로 재사용한다.

#### `content_boards` 신규

- `id`, `workspaceId`, `folderId`
- `title`
- `intent`: create / optimize / repurpose / brief
- `status`: active / completed / failed / archived
- `createdBy`, 감사 컬럼

#### `content_messages` 신규

- `id`, `boardId`
- `role`: user / assistant / system
- `kind`: text / requirements / progress / artifact / error
- `body`, `payloadJson`
- 생성 시각

#### `content_runs` 신규

- `id`, `boardId`, 선택적 `articleId`
- `intent`
- `status`: queued / running / completed / failed / cancelled
- `stage`: validate / research / generate / analyze / persist
- `inputJson`, `outputMetaJson`
- `provider`, `source`, `errorCode`, `errorMessage`
- 시작·완료 시각, 감사 컬럼

#### `content_articles` 확장

- `boardId` nullable FK
- `sourceUrl` nullable
- 기존 `mode`, `status`, `keyword`, `wordCount`, `seoScore`, `body` 유지
- 동일 제목 재생성·버전을 막는 현재 workspace/title 유니크 제약은 일반 인덱스로 완화

설정 원본은 재현성과 비용 추적을 위해 `content_runs.inputJson`에 저장하고, 사용자가 보는 최종 문서는 `content_articles`에 저장한다.

### 실제 데이터 공급자

| 목적 | 공급자 | 원칙 |
| --- | --- | --- |
| 키워드·SERP·경쟁 문서 | TalorData | 실제 응답만 사용하고 출처/수집 시각 표시 |
| URL 원문 수집 | Firecrawl 공용 클라이언트 | URL 실패 시 직접 입력으로 전환, 빈 본문을 꾸미지 않음 |
| 기사·변환·브리프 구조화 | ChatMock `/v1/responses` | JSON 지시 후 Zod 스키마 검증, 모델/실행 시각/오류 기록 |
| SEO 점수 | 결정적 규칙 + 수집된 SERP 기준 | LLM이 임의 점수를 만들지 않음 |

ChatMock 호출은 공용 서버 전용 클라이언트로 분리한다. ChatMock이 OpenAI 구조화 출력 옵션을 제공한다고 가정하지 않고 JSON 전용 응답을 지시한 뒤 Zod로 검증한다. 입력 URL과 SERP 본문은 신뢰할 수 없는 데이터로 취급하고 프롬프트 인젝션 방어 구분자를 둔다.

### API 계약

- `GET /api/content/boards?folderId=&status=` — 작업판 목록
- `POST /api/content/boards` — 첫 요청과 함께 작업판 생성
- `GET /api/content/boards/[boardId]` — 메시지·최근 실행·산출물 조회
- `PATCH /api/content/boards/[boardId]` — 제목·상태 변경
- `POST /api/content/boards/[boardId]/messages` — 후속 요청 추가
- `POST /api/content/boards/[boardId]/runs` — 검증된 설정으로 queued run 생성, 202 반환
- `POST /api/content/runs/[runId]/process` — queued→running 원자 전이 후 실제 단계 실행
- `GET /api/content/runs/[runId]` — 실제 단계·오류·완료 산출물 조회
- 기존 `/api/content` — 문서 라이브러리 CRUD로 유지

초기 구현은 Position Tracking의 run/process 패턴처럼 실행 생성과 처리를 분리하고 1–2초 간격으로 상태를 폴링한다. `process`는 중복 호출에 안전해야 하며 완료·실패 run을 다시 실행하지 않는다. 실제 스트리밍 편집 경험이 필요해질 때 SSE를 별도 단계로 추가한다.

## 7. 예상 파일 구조

```text
src/
├── app/(app)/content/
│   ├── page.tsx
│   ├── workspaces/page.tsx
│   ├── workspaces/[boardId]/page.tsx
│   └── library/page.tsx
├── app/api/content/
│   ├── boards/route.ts
│   ├── boards/[boardId]/route.ts
│   ├── boards/[boardId]/messages/route.ts
│   ├── boards/[boardId]/runs/route.ts
│   ├── runs/[runId]/process/route.ts
│   └── runs/[runId]/route.ts
├── components/content/
│   ├── ContentHome.tsx
│   ├── ContentBoard.tsx
│   ├── ContentConversation.tsx
│   ├── ContentCanvas.tsx
│   ├── ContentRequirementsCard.tsx
│   ├── ContentRunProgress.tsx
│   ├── ContentArtifactCard.tsx
│   ├── ContentSeoInspector.tsx
│   └── ContentLibrary.tsx
├── db/schema/content.ts
├── server/content/
│   ├── contracts.ts
│   ├── boards.ts
│   ├── runs.ts
│   ├── research.ts
│   ├── generate.ts
│   ├── optimize.ts
│   └── scoring.ts
└── server/chatmock/client.ts
```

기존 코드에서 직접 수정할 핵심 파일:

- `src/data/app-nav.ts` — Content 사이드바 3항목으로 축소
- `src/components/app/ToolkitSideNav.tsx` — Content 폴더 문맥 전달 및 접힘 접근성 보완
- `src/app/(app)/content/page.tsx` — 정적 랜딩 대신 `ContentHome`
- `src/db/schema/index.ts` — Content 스키마 export
- `src/server/resources.ts` — 기존 문서 CRUD와 새 라이브러리 필드 정합성 유지

## 8. 단계별 실행 계획

### Phase 0 — 계약과 품질 기준

- 작업판·메시지·실행·산출물 TypeScript/Zod 계약 정의.
- 모드별 상태 전이와 실패 코드를 먼저 테스트.
- 워크스페이스/폴더 격리, 입력 길이, URL 안전성, 중복 실행 방지 규칙 정의.
- 기존 콘텐츠 제목 유니크 제약을 완화하고 마이그레이션 회귀 테스트 추가.
- 1904×947 및 모바일 핵심 화면 와이어프레임 확정.

완료 조건:

- 잘못된 상태 전이가 테스트에서 거부된다.
- 다른 워크스페이스의 board/run/article 조회가 불가능하다.
- 가짜 샘플 데이터가 계약에 포함되지 않는다.

### Phase 1 — 홈·작업판·라이브러리 골격

- Content 사이드바를 3항목으로 축소.
- `/content/`에 명령 입력, 의도 칩, 실제 최근 작업 목록 구현.
- `/content/workspaces/`에 작업판 검색·상태 필터 목록 구현.
- `/content/workspaces/[id]/`에 대화 패널 + 결과 캔버스 구현.
- `/content/library/`를 기존 `/api/content` CRUD와 연결.
- 이전 5개 도구 URL의 호환 리다이렉트 추가.

완료 조건:

- 홈에서 1회 입력으로 board가 생성되고 새 작업판으로 이동한다.
- 새로고침 후 동일 작업판과 메시지가 복원된다.
- 1904×947에서 가로 스크롤이 없고 결과 캔버스가 1000px 이상 확보된다.
- 모바일에서 대화 패널이 결과를 가리지 않는다.

### Phase 2 — 기사 생성 세로 슬라이스

- 추천 설정: 콘텐츠 유형, 위치/언어, 제목, 키워드, 분량, 브랜드 보이스.
- 고급 설정은 기본 접힘, 추천값과 근거 표시.
- TalorData 연구 → ChatMock JSON 초안 + Zod 검증 → 결정적 검사 → `content_articles` 저장.
- 실제 run stage와 실패·재시도 UI 연결.
- 생성된 기사의 편집·저장·작업판 재개 지원.

완료 조건:

- 입력부터 영구 저장된 기사까지 실제 공급자 기반으로 완료된다.
- 공급자 미설정·한도 초과·스키마 오류가 명확한 실패 상태로 남는다.
- 재시도는 새 run을 만들고 기존 실패 기록을 보존한다.
- 모델이 반환한 임의 점수나 하드코딩 문구를 저장하지 않는다.

### Phase 3 — 최적화·브리프·재활용

- URL 가져오기와 직접 입력을 동일한 최적화 계약으로 구현.
- Firecrawl 원문·TalorData 경쟁 문서·규칙 기반 SEO 점수를 결합.
- Topic Finder를 독립 리포트가 아니라 브리프/기사 생성의 연구 단계로 연결.
- 기존 article 또는 붙여넣은 원문을 재활용 입력으로 지원.

완료 조건:

- 최적화 전후 변경과 점수 근거를 항목별로 확인할 수 있다.
- Firecrawl 실패 시 직접 입력으로 복구 가능하다.
- 브리프에서 한 번의 액션으로 기사 생성 board 문맥이 이어진다.
- 재활용 결과가 원문과 별도 article로 저장되고 연결 관계가 남는다.

### Phase 4 — 편집·검토·배포 준비

- 자동 저장과 낙관적 동시성(version) 처리.
- SEO 검사 패널, 변경 제안 적용/되돌리기.
- 초안 → 검토 중 → 게시 상태 전이와 감사 로그.
- 키보드 탐색, 스크린리더 레이블, 포커스 복귀, 오류 요약.

완료 조건:

- 두 탭에서 수정 충돌 시 조용히 덮어쓰지 않는다.
- Save/Publish 버튼이 실제 상태와 권한을 반영한다.
- WCAG 키보드 핵심 흐름과 `aria-live` 진행 상태가 검증된다.

### Phase 5 — 검증과 점진적 전환

- 단위 테스트: 의도 매핑, 상태 전이, 점수 계산, 출력 스키마.
- 통합 테스트: 인증, 폴더 격리, 공급자 실패, 영구 저장, 재시도.
- E2E: 생성, 재개, URL 최적화, 브리프→기사, 모바일.
- lint, TypeScript, 프로덕션 build 통과.
- 기존 URL을 먼저 호환 유지한 뒤 사용 로그를 확인하고 오래된 템플릿 제거.

## 9. 우선순위

### P0 — 반드시 먼저

- Content Home 명령 입력
- Board 영구 저장/재개
- 기사 생성 실제 파이프라인
- 실패/재시도/출처 표시
- 실제 Library 연결

### P1 — 같은 구조 위에 확장

- URL 최적화
- SEO 브리프
- 콘텐츠 재활용
- SEO 검사와 변경 적용

### P2 — 근거가 생긴 뒤

- 소셜 게시물 형식
- AI 이미지 생성
- 공유 링크·외부 게시 연동
- 실시간 토큰 스트리밍
- 자유 배치 캔버스

## 10. 제품 성공 기준

- 새 작업 시작: 홈 진입 후 `1개 입력 + 최대 1개 추천 설정 확인`.
- 정보 구조: Content 사이드바의 1차 목적지 3개 이하.
- 지속성: 모든 완료/실패 실행은 새로고침 후 복원.
- 진실성: 모든 연구·생성 결과에 공급자와 수집/실행 시각 표시.
- 복구성: 공급자 오류 후 동일 입력으로 재시도 가능.
- 레이아웃: 1904×947에서 가로 스크롤 없음, board 결과 폭 1000px 이상.
- 반응형: 390×844에서 명령 입력, 진행 상태, 결과 편집의 핵심 흐름 완료.
- 품질: 관련 테스트, lint, TypeScript, build 모두 통과.

## 11. 최종 권고

첫 구현은 `새 글 작성` 하나만 완전하게 끝낸다. 영상에서 가장 강한 패턴은 기능 수가 아니라 문맥이 유지되는 작업판이다. 기사 생성이 실제 연구, 실제 AI 호출, 저장, 재개, 실패 복구까지 완성되면 최적화·재활용·브리프는 같은 보드와 실행 모델에 낮은 위험으로 추가할 수 있다.
