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
    <footer className="bg-white">
      {/* CTA 밴드 */}
      <section className="pb-12 pt-24">
        <div className="mp-container text-center">
          <h2 className="font-lazzer text-[32px] font-semibold uppercase leading-none tracking-[-1.92px] text-mp-off-black md:text-[48px] md:leading-[48px]">
            {cta.heading}
          </h2>
          <p className="mb-6 mt-4 font-lazzer text-[16px] text-mp-off-black">
            {cta.subtext}
          </p>
          <Link
            href={cta.href}
            className="inline-block rounded-pill bg-mp-lavendar px-[30px] py-[21px] font-lazzer text-[16px] font-semibold leading-none text-mp-off-black transition-colors duration-200 ease-in-out hover:bg-mp-lavendar-hover"
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
              <div key={group.heading} className="border-b border-mp-light-grey md:border-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-4 font-lazzer text-[16px] font-semibold text-mp-off-black md:hidden"
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
                <h3 className="hidden font-lazzer text-[16px] font-semibold text-mp-off-black md:mb-6 md:block">
                  {group.heading}
                </h3>
                <ul className={cn(isOpen ? "block pb-4" : "hidden", "md:block md:pb-0")}>
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <FooterLink
                        link={link}
                        className="block py-1.5 font-lazzer text-[14px] font-medium text-mp-off-black transition-colors duration-200 ease-in-out hover:text-mp-dark-grey"
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
      <div className="border-t border-mp-light-grey">
        <div className="mp-container flex flex-wrap items-center gap-x-6 gap-y-3 py-6">
          <img src={adobeLogoDataUri} alt="Adobe" width={62} height={15} />
          <p className="font-lazzer text-[14px] text-mp-dark-grey">
            {legal.copyright} {legal.rights}
          </p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 md:ml-auto">
            {legal.links.map((link) => (
              <li key={link.label}>
                <FooterLink
                  link={link}
                  className="font-lazzer text-[14px] text-mp-dark-grey transition-colors duration-200 ease-in-out hover:text-mp-off-black"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
