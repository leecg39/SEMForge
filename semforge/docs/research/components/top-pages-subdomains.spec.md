# TopPagesCard + TopSubdomainsCard 명세

## 개요
- 대상 파일: `src/components/analytics/organic/TopPagesCards.tsx` (2개 export)
- 스크린샷: `docs/design-references/semrush-organic/10-top-pages.png`, `11-top-subdomains.png`
- 원본 DOM: `docs/research/extract/top-pages-full.json`, `top-subdomains-full.json`
- 인터랙션: 링크, 행 hover, (정렬 아이콘 시각만)

## 구조 (공통)
- 534px 카드(OrganicCard). title=`상위 페이지` / `상위 서브도메인`.
- 테이블:
  - 헤더: `URL`|`서브도메인`(좌) · `트래픽 %`(우, sortable 아이콘) · `키워드`(우)
  - 행 최대 5개, 높이 37px:
    - URL/서브도메인: 파란 링크 rgb(35,95,226) 14px + 외부링크 아이콘(14px) — **긴 URL 은 가운데 생략**(`www.mega-info.co.....any/group_info.php` 형태, CSS 불가하므로 JS로 head…tail 조합, 최대 ~34자)
    - 트래픽 %: `77.61`, `< 0.01` 형식 문자열, 우측 정렬
    - 키워드: 정수 우측 정렬
- 하단: OrganicCta `페이지 {n}개 모두 보기` / `서브도메인 {n}개 모두 보기`.
- rows 비면 12px 회색 empty 문구.

## Props
```ts
interface TopPageRow { display: string; href: string; trafficPct: string; keywords: number }
// TopPagesCard / TopSubdomainsCard 동일 형태
{ rows: TopPageRow[]; totalCount: number; viewAllHref: string;
  copy: { title: string; headers: { url: string; traffic: string; keywords: string }; viewAll: (n: number) => string; empty: string } }
```
(서브도메인 카드 headers.url 은 "서브도메인" 라벨로 사용)

## 정직성
- trafficPct 는 부모 계산 문자열(모델 추정), keywords 는 실측 카운트.
