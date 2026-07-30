/**
 * 로그인 앱 셸 전용 라인 아이콘 세트 (24x24, stroke=currentColor).
 * appGlobalNav / appToolkits 의 icon 키와 1:1 매핑.
 */

import type { ReactElement, SVGProps } from "react";

export type AppIconProps = SVGProps<SVGSVGElement>;
export type AppIcon = (props: AppIconProps) => ReactElement;

function IconBase({ children, ...props }: AppIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <path d="m4 11 8-7 8 7" />
      <path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8" />
      <path d="M10 20v-5.5h4V20" />
    </IconBase>
  );
}

/** 돋보기 — seo / 전역 검색 공용 */
export function SearchIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6.3" />
      <path d="m15.6 15.6 4.9 4.9" />
    </IconBase>
  );
}

export function AiSparkleIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5l1.7 5.3L19 12l-5.3 1.7L12 19l-1.7-5.3L5 12l5.3-1.7L12 5z" />
      <path d="M18.5 3.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </IconBase>
  );
}

export function TrafficIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 20h16" />
      <path d="M7.5 20v-5" />
      <path d="M12 20v-9" />
      <path d="M16.5 20v-13" />
    </IconBase>
  );
}

export function LocalPinIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <path d="M18.5 10.5c0 4.6-6.5 10-6.5 10s-6.5-5.4-6.5-10a6.5 6.5 0 0 1 13 0z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </IconBase>
  );
}

export function ContentDocIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <path d="M13.5 3.5H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
      <path d="M13.5 3.5V8H18" />
      <path d="M9 12.5h6M9 16h6" />
    </IconBase>
  );
}

export function AdvertisingIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 5.5 7.5 9H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2.5L16 18.5v-13z" />
      <path d="M19 10a3.5 3.5 0 0 1 0 4" />
      <path d="m8.5 15.5 1.2 4" />
    </IconBase>
  );
}

export function PrBubbleIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-6.2L8 20v-4H5a1.5 1.5 0 0 1-1.5-1.5z" />
    </IconBase>
  );
}

export function SocialShareIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <circle cx="6.5" cy="12" r="2.5" />
      <circle cx="17.5" cy="5.5" r="2.5" />
      <circle cx="17.5" cy="18.5" r="2.5" />
      <path d="m8.8 10.9 6.4-4.2M8.8 13.1l6.4 4.2" />
    </IconBase>
  );
}

export function ReportsClipboardIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 4.5H7A1.5 1.5 0 0 0 5.5 6v13.5A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 17 4.5h-2" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="M9 11.5h6M9 15h6" />
    </IconBase>
  );
}

export function AppsGridIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </IconBase>
  );
}

export function ChevronDownIcon(props: AppIconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

/** appGlobalNav / appToolkits 의 icon 문자열 키 → 아이콘 컴포넌트 */
export const appIcons: Record<string, AppIcon> = {
  home: HomeIcon,
  seo: SearchIcon,
  ai: AiSparkleIcon,
  traffic: TrafficIcon,
  local: LocalPinIcon,
  content: ContentDocIcon,
  advertising: AdvertisingIcon,
  pr: PrBubbleIcon,
  social: SocialShareIcon,
  reports: ReportsClipboardIcon,
  apps: AppsGridIcon,
  chevron: ChevronDownIcon,
  search: SearchIcon,
};
