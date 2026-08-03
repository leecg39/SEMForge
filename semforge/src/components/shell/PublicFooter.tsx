"use client";

import Link from "next/link";
import { useState } from "react";
import {
  footerCta,
  footerGroups,
  footerLegal,
  footerSocial,
  type NavLink,
} from "@/data/nav";
import {
  adobeLogoDataUri,
  socialIconDataUris,
} from "@/components/shell/icon-data";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";
import { cn } from "@/lib/utils";

/** '#...' 링크(Cookies Settings, Do not sell my personal info)는 쿠키 설정 이벤트로 연결 */
function FooterLink({ link, className }: { link: NavLink; className?: string }) {
  if (link.href.startsWith("#")) {
    return (
      <a
        href={link.href}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("open-cookie-settings"));
        }}
      >
        {link.label}
      </a>
    );
  }
  if (link.external || link.href.startsWith("http")) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m3 6 5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PublicFooter() {
  const cta = useLocalizedValue(footerCta);
  const groups = useLocalizedValue(footerGroups);
  const legal = useLocalizedValue(footerLegal);
  const tx = useSiteText();
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  const toggleGroup = (heading: string) =>
    setOpenGroups((cur) =>
      cur.includes(heading) ? cur.filter((h) => h !== heading) : [...cur, heading],
    );

  return (
    <footer className="bg-faint">
      {/* CTA 밴드 */}
      <section className="border-b border-bebe bg-white py-20">
        <div className="mp-container text-center">
          <h2 className="font-lazzer text-[28px] font-semibold leading-9 tracking-[-0.8px] text-hof md:text-[36px] md:leading-[44px]">
            {cta.heading}
          </h2>
          <p className="mb-7 mt-3 font-lazzer text-[15px] text-foggy">
            {cta.subtext}
          </p>
          <Link
            href={cta.href}
            className="inline-flex min-h-11 items-center rounded-[8px] bg-rausch px-6 py-3 font-lazzer text-[14px] font-semibold leading-5 text-white transition-colors duration-200 ease-in-out hover:bg-rausch-600"
          >
            {cta.buttonLabel}
          </Link>
        </div>
      </section>

      {/* 본문 내비: 데스크톱 6열 그리드 / 모바일 아코디언 */}
      <nav className="mp-container" aria-label={tx("Footer")}>
        <div className="md:grid md:grid-cols-3 md:gap-8 lg:grid-cols-6">
          {groups.map((group) => {
            const isOpen = openGroups.includes(group.heading);
            return (
              <div key={group.heading} className="border-b border-bebe md:border-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-4 font-lazzer text-[14px] font-semibold text-hof md:hidden"
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(group.heading)}
                >
                  {group.heading}
                  <ChevronDownIcon
                    className={cn(
                      "shrink-0 transition-transform duration-200 ease-in-out",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                <h3 className="hidden font-lazzer text-[14px] font-semibold text-hof md:mb-5 md:block">
                  {group.heading}
                </h3>
                <ul className={cn(isOpen ? "block pb-4" : "hidden", "md:block md:pb-0")}>
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <FooterLink
                        link={link}
                        className="block py-1.5 font-lazzer text-[14px] font-medium text-foggy transition-colors duration-200 ease-in-out hover:text-hof"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* 소셜 + 언어 선택 */}
        <div className="flex flex-wrap items-center justify-between gap-6 py-10">
          <ul className="flex items-center gap-4">
            {footerSocial.map((social) => (
              <li key={social.icon}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                >
                  <img
                    src={socialIconDataUris[social.icon]}
                    alt=""
                    width={24}
                    height={24}
                    className="h-6 w-6"
                  />
                </a>
              </li>
            ))}
          </ul>

          <LanguageSwitcher />
        </div>
      </nav>

      {/* 하단 바 */}
      <div className="border-t border-bebe bg-white">
        <div className="mp-container flex flex-wrap items-center gap-x-6 gap-y-3 py-6">
          <img src={adobeLogoDataUri} alt="Adobe" width={62} height={15} />
          <p className="font-lazzer text-[13px] text-foggy">
            {legal.copyright} {legal.rights}
          </p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 md:ml-auto">
            {legal.links.map((link) => (
              <li key={link.label}>
                <FooterLink
                  link={link}
                  className="font-lazzer text-[13px] text-foggy transition-colors duration-200 ease-in-out hover:text-hof"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
