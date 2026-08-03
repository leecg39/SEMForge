"use client";

import Link from "next/link";
import { topBanner } from "@/data/nav";
import { useLocalizedValue } from "@/i18n/useLocalizedValue";

export default function TopBanner() {
  const banner = useLocalizedValue(topBanner);

  return (
    <Link
      href={banner.href}
      className="flex h-9 items-center justify-center gap-2 bg-hof px-4 py-2 font-lazzer text-[13px] leading-5 text-white transition-colors duration-200 ease-in-out hover:bg-black"
    >
      <span className="font-semibold text-rausch">{banner.text}</span>
      <span className="hidden font-normal sm:inline">{banner.subtext}</span>
    </Link>
  );
}
