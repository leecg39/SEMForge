"use client";

import { logoWall } from "@/data/pages/home";
import { useSiteText } from "@/i18n/useLocalizedValue";

const MARQUEE_KEYFRAMES = `@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`;

export default function LogoMarquee() {
  const tx = useSiteText();

  return (
    <section
      aria-label={tx("Trusted by leading brands")}
      className="flex h-[180px] items-center overflow-hidden py-[40px]"
    >
      <style>{MARQUEE_KEYFRAMES}</style>
      <div className="flex w-max animate-[marquee_40s_linear_infinite]">
        {/* 동일한 로고 세트를 2회 렌더링해 -50% 이동 시 끊김 없이 반복 */}
        {[0, 1].map((copy) => (
          <div
            key={copy}
            aria-hidden={copy === 1}
            className="flex items-center gap-[64px] pr-[64px]"
          >
            {logoWall.map((logo) => (
              <img
                key={`${copy}-${logo.name}`}
                src={logo.src}
                alt={logo.name}
                loading="lazy"
                className="h-[28px] w-auto max-w-none"
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
