# SeoDashHeader Specification

## Overview
- **Target file:** `src/components/seo-dash/SeoDashHeader.tsx`
- **Screenshot:** `docs/design-references/ko.semrush.com/seo-dashboard-current-1440.png` (상단 영역)
- **Interaction model:** 클릭(프로젝트 드롭다운, 공유, 설정, 피드백 링크)

## DOM Structure
```
<section>  (padding: 16px 18px 16px 32px, maxWidth: max(100% - 14px, 1030px))
  <div flex justify-between align-baseline mb-2>   <!-- 행1: h=20 -->
    <nav aria-label="breadcrumb"><ol>프로젝트 / SEO</ol></nav>
    <button link>💬 피드백 보내기</button>
  </div>
  <div flex justify-between align-center gap-[60px]>  <!-- 행2: h=28 -->
    <div flex align-center gap-2>
      <h1>SEO 대시보드: {프로젝트명}</h1>
      <button 프로젝트 pill>맥킨지 코리아 ⌄</button>   <!-- aria="프로젝트: {이름}" -->
      <a 정보 아이콘 (i) />
    </div>
    <div flex gap-2>
      <button primary dark>SEO 프로젝트 만들기</button>
      <button secondary>공유</button>
      <button icon aria-label="설정 열기">⚙</button>
    </div>
  </div>
</section>
```

## Computed Styles (getComputedStyle 실측)

### Container
- padding: 16px 18px 16px 32px; maxWidth: max(100% - 14px, 1030px); font: Inter 14px/400/20px; color: oklch(0.1 0.03 137 / 0.899)

### Breadcrumb (행1 좌)
- 항목 텍스트: 14px/400, color oklch 본문, separator 16×16 color display-p3(0.0036 0.02041 0.00996/0.385), margin 0 8px
- 내용: "프로젝트" › "SEO"

### 피드백 보내기 버튼 (행1 우)
- inline-block, 14px/400/19.88, color: rgb(35, 95, 226), cursor pointer, 아이콘 16×16 margin 0 4px 2px 0

### H1
- fontSize 20px, fontWeight 600, lineHeight 24px, Inter, color oklch(0.1 0.03 137 / 0.899)
- 텍스트: "SEO 대시보드: 맥킨지 코리아"

### 프로젝트 pill 버튼
- h=25px, 14px/400, color rgb(35, 95, 226), flex align-center, cursor pointer, chevron 포함
- aria-label: "프로젝트: 맥킨지 코리아"

### 정보 아이콘 링크
- 16×16, color oklch(0.104 0.023 162.3 / 0.385)

### SEO 프로젝트 만들기 (primary)
- bg: rgb(26, 30, 26); color: rgba(254, 255, 255, 0.95); radius 6px; h 28px; 14px/500 Inter; padding 좌우 ~12px; border 1px solid transparent

### 공유 (secondary)
- h 28px, 14px/500, radius 6px, border/배경은 프로젝트 secondary 버튼 토큰 사용 (border-app-border bg-white)

### 설정 열기 (icon)
- 28×28 icon button, aria-label="설정 열기"

## States & Behaviors
- **프로젝트 pill 클릭**: 드롭다운 — 워크스페이스 폴더(프로젝트) 목록 + 선택 시 `?domain=` 변경 (기존 SeoDashboard 드롭다운 로직 재사용 가능)
- **공유/설정/프로젝트 만들기**: 이번 범위에서는 클릭 시 아무 동작 안 함(버튼만) — hover 표준 전이
- **피드백 보내기**: 페이지 하단 피드백 섹션으로 앵커 이동 불가 시 동작 없음

## Text Content (verbatim)
- "프로젝트", "SEO", "피드백 보내기", "SEO 대시보드: ", "SEO 프로젝트 만들기", "공유"

## Props
- `projectName: string` (기본 "맥킨지 코리아"가 아니라 워크스페이스 첫 폴더명 또는 ?domain 기반)
- `projects: { id: string; name: string; domain: string }[]` (폴더 목록)
- `currentDomain: string`, `onSelectProject?: (domain: string) => void`

## Responsive
- 1440: 전체 표시. 768 이하: "SEO 프로젝트 만들기"/"공유" 숨김, H1 18px
