"use client";

import Link from "next/link";
import { appGlobalNav } from "@/data/app-nav";
import { appIcons } from "@/components/app/app-icons";
import { cn } from "@/lib/utils";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";

/** 좌측 최외곽 툴킷 아이콘 레일 (72px, 데스크톱 전용) */
export function AppGlobalNav({ activeKey }: { activeKey: string }) {
  const globalNav = useLocalizedValue(appGlobalNav);
  const tx = useSiteText();

  return (
    <aside
      aria-label={tx("Toolkits")}
      className="sticky top-[64px] z-30 hidden h-[calc(100dvh-64px)] w-[72px] shrink-0 flex-col items-center gap-[2px] overflow-y-auto border-r border-bebe bg-white pb-4 pt-2 min-[1025px]:flex"
    >
      {globalNav.map((item) => {
        const Icon = appIcons[item.icon];
        const active = item.key === activeKey;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="group relative flex w-full flex-col items-center gap-[2px] py-[6px]"
          >
            <span
              className={cn(
                "absolute left-0 top-[12px] h-[36px] w-[3px] rounded-r-full bg-app-blue",
                active ? "opacity-100" : "opacity-0"
              )}
            />
            <span
              className={cn(
                "flex h-[48px] w-[48px] items-center justify-center rounded-[8px] transition-colors",
                active
                  ? "bg-faint text-hof"
                  : "text-foggy group-hover:bg-faint group-hover:text-hof"
              )}
            >
              <Icon width={24} height={24} />
            </span>
            <span
              className={cn(
                "max-w-[60px] truncate px-[2px] text-center text-[9px] leading-[12px]",
                active ? "font-semibold text-hof" : "text-foggy"
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
