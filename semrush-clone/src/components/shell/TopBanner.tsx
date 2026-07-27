import Link from "next/link";
import { topBanner } from "@/data/nav";

export default function TopBanner() {
  return (
    <Link
      href={topBanner.href}
      className="flex h-9 items-center justify-center gap-2 bg-mp-lavendar px-4 py-2 font-lazzer text-[14px] leading-5 text-mp-off-black transition-colors duration-200 ease-in-out hover:bg-mp-lavendar-hover"
    >
      <span className="font-semibold">{topBanner.text}</span>
      <span className="hidden font-normal sm:inline">{topBanner.subtext}</span>
    </Link>
  );
}
