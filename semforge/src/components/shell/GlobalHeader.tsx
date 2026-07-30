"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { headerMenus, type MegaMenu, type NavLink } from "@/data/nav";
import { burgerDataUri, logoDataUri } from "@/components/shell/icon-data";
import type { Dictionary } from "@/i18n/dictionaries";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";
import { cn } from "@/lib/utils";

type HeaderNavItem =
  | { kind: "menu"; menu: MegaMenu }
  | { kind: "link"; link: NavLink };

/** 실측 순서: Product · Pricing · Solutions · Resources · Enterprise */
const navItems: HeaderNavItem[] = [
  { kind: "menu", menu: headerMenus[0] },
  { kind: "link", link: { label: "Pricing", href: "/pricing/" } },
  { kind: "menu", menu: headerMenus[1] },
  { kind: "menu", menu: headerMenus[2] },
  {
    kind: "link",
    link: { label: "Enterprise", href: "/ext/enterprise.semforge.com/", external: true },
  },
];

const navItemClass =
  "rounded-[10px] px-2 py-1 font-lazzer text-[16px] font-semibold leading-normal tracking-[-0.32px] text-mp-off-black transition-colors duration-200 ease-in-out hover:bg-[rgba(0,0,0,0.06)]";

function isExternal(link: NavLink) {
  return Boolean(link.external) || link.href.startsWith("http");
}

function NavAnchor({
  link,
  className,
  onClick,
  onMouseEnter,
  children,
}: {
  link: NavLink;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  children: React.ReactNode;
}) {
  if (isExternal(link)) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className} onClick={onClick} onMouseEnter={onMouseEnter}>
      {children}
    </Link>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m6 3 5 5-5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m10 3-5 5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="m3.5 3.5 11 11m0-11-11 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 데스크톱 메가메뉴 패널 — 항상 마운트해 두고 opacity/translate 전환 */
function MegaPanel({
  menu,
  open,
  onNavigate,
}: {
  menu: MegaMenu;
  open: boolean;
  onNavigate: () => void;
}) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 top-full hidden transition-opacity duration-300 ease-in-out lg:block",
        open ? "visible opacity-100" : "pointer-events-none invisible opacity-0",
      )}
    >
      <div className="mx-8">
        <div className="mx-auto max-w-[1376px] rounded-3xl bg-white p-10 shadow-[0_2px_12px_rgba(0,0,0,0.05),0_12px_40px_rgba(0,0,0,0.08)]">
          <div
            className="grid items-start gap-8"
            style={{
              gridTemplateColumns: `repeat(${menu.groups.length}, minmax(200px, 1fr))${
                menu.promo ? " 280px" : ""
              }`,
            }}
          >
            {menu.groups.map((group) => (
              <div key={group.heading}>
                <h3 className="mb-3 font-lazzer text-[14px] font-semibold uppercase text-mp-dark-grey">
                  {group.heading}
                </h3>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <NavAnchor
                        link={link}
                        className="block py-1.5 font-lazzer text-[16px] font-medium text-mp-off-black transition-colors duration-200 ease-in-out hover:text-mp-dark-grey"
                        onClick={onNavigate}
                      >
                        {link.label}
                        {isExternal(link) ? (
                          <span aria-hidden="true" className="text-[13px]">
                            {" "}
                            ↗
                          </span>
                        ) : null}
                      </NavAnchor>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {menu.promo ? (
              <NavAnchor
                link={{ label: menu.promo.title, href: menu.promo.href }}
                className="block w-[280px] rounded-2xl bg-[linear-gradient(180deg,#eef7ee_0%,#dceeeb_100%)] p-6"
                onClick={onNavigate}
              >
                {menu.promo.eyebrow ? (
                  <p className="font-lazzer text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5a6b62]">
                    {menu.promo.eyebrow}
                  </p>
                ) : null}
                <p
                  className={cn(
                    "font-serif text-[24px] leading-[1.2] text-mp-off-black",
                    menu.promo.eyebrow ? "mt-2" : "",
                  )}
                >
                  {menu.promo.title}
                </p>
                {menu.promo.description ? (
                  <p className="mt-2 font-lazzer text-[14px] text-mp-dark-grey">
                    {menu.promo.description}
                  </p>
                ) : null}
                {menu.promo.buttonLabel ? (
                  <span className="mt-5 inline-flex items-center gap-2 rounded-pill bg-mp-off-black px-5 py-2.5 font-lazzer text-[14px] font-semibold text-app-orange">
                    {menu.promo.buttonLabel}
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="m6 3 5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                ) : null}
              </NavAnchor>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GlobalHeader({ dict }: { dict: Dictionary }) {
  const localizedNavItems = useLocalizedValue(navItems);
  const localizedHeaderMenus = useLocalizedValue(headerMenus);
  const tx = useSiteText();
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSubmenu, setDrawerSubmenu] = useState<MegaMenu | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* 메가메뉴는 클릭으로만 연다(영상 실측: 호버로는 열리지 않음).
     Esc 또는 헤더 바깥 클릭 시 닫는다. */
  useEffect(() => {
    if (!openMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openMenu]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerSubmenu(null);
  };

  return (
    <header
      ref={headerRef}
      className={cn(
        "sticky top-0 z-[500] transition-all duration-200 ease-in-out",
        scrolled ? "bg-[#eaf4f2]" : "bg-mp-mint",
      )}
      onMouseLeave={() => setOpenMenu(null)}
    >
      {/* 열린 메가메뉴 뒤 페이지 디밍 (영상 실측) — 클릭 시 닫힘 */}
      <div
        aria-hidden="true"
        onClick={() => setOpenMenu(null)}
        className={cn(
          "fixed inset-x-0 bottom-0 top-[84px] -z-10 hidden bg-black/30 transition-opacity duration-300 ease-in-out lg:block",
          openMenu ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div className="mx-auto flex h-[84px] max-w-[1440px] items-center px-8">
        <Link href="/" className="shrink-0" aria-label={tx("SEMForge homepage")}>
          <img src={logoDataUri} alt="SEMForge" width={150} height={36} />
        </Link>

        {/* 데스크톱 내비게이션 */}
        <nav className="ml-6 hidden flex-1 items-center gap-1 lg:flex" aria-label={tx("Main")}>
          {localizedNavItems.map((item) =>
            item.kind === "menu" ? (
              <button
                key={item.menu.label}
                type="button"
                className={cn(
                  navItemClass,
                  openMenu === item.menu.label && "bg-[rgba(0,0,0,0.06)]",
                )}
                aria-expanded={openMenu === item.menu.label}
                onMouseEnter={() => {
                  if (openMenu && openMenu !== item.menu.label) setOpenMenu(null);
                }}
                onClick={() =>
                  setOpenMenu((cur) => (cur === item.menu.label ? null : item.menu.label))
                }
              >
                {item.menu.label}
              </button>
            ) : (
              <NavAnchor
                key={item.link.label}
                link={item.link}
                className={navItemClass}
                onMouseEnter={() => setOpenMenu(null)}
              >
                {item.link.label}
                {isExternal(item.link) ? <span aria-hidden="true"> ↗</span> : null}
              </NavAnchor>
            ),
          )}
        </nav>

        {/* 데스크톱 우측 버튼 */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <Link
            href="/login/"
            className="rounded-pill border border-mp-off-black px-6 py-3 font-lazzer text-[16px] font-semibold leading-none tracking-[-0.32px] text-mp-off-black transition-colors duration-200 ease-in-out hover:bg-[rgba(0,0,0,0.05)]"
          >
            {dict.header.logIn}
          </Link>
          <Link
            href="/signup/"
            className="rounded-pill bg-mp-off-black px-6 py-3 font-lazzer text-[16px] font-semibold leading-none tracking-[-0.32px] text-white transition-colors duration-200 ease-in-out hover:bg-[#2a2f27]"
          >
            {dict.header.signUp}
          </Link>
        </div>

        {/* 모바일 버거 */}
        <button
          type="button"
          className="ml-auto flex h-10 w-10 items-center justify-center lg:hidden"
          aria-label={dict.header.openMenu}
          onClick={() => setDrawerOpen(true)}
        >
          <img src={burgerDataUri} alt="" width={18} height={18} />
        </button>
      </div>

      {/* 데스크톱 메가메뉴 패널 */}
      {localizedHeaderMenus.map((menu) => (
        <MegaPanel
          key={menu.label}
          menu={menu}
          open={openMenu === menu.label}
          onNavigate={() => setOpenMenu(null)}
        />
      ))}

      {/* 모바일 전면 드로어 */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-[600] flex flex-col bg-white lg:hidden">
          <div className="flex h-[70px] shrink-0 items-center justify-between px-4">
            <div className="flex w-10 justify-start">
              {drawerSubmenu ? (
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center text-mp-off-black"
                  aria-label={dict.header.back}
                  onClick={() => setDrawerSubmenu(null)}
                >
                  <ChevronLeftIcon />
                </button>
              ) : null}
            </div>
            <Link href="/" aria-label={tx("SEMForge homepage")} onClick={closeDrawer}>
              <img src={logoDataUri} alt="SEMForge" width={125} height={30} />
            </Link>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center text-mp-off-black"
              aria-label={dict.header.closeMenu}
              onClick={closeDrawer}
            >
              <CloseIcon />
            </button>
          </div>

          {drawerSubmenu ? (
            /* 2단계: 선택한 메뉴의 그룹 목록 */
            <div className="flex-1 overflow-y-auto px-6 pb-10">
              {drawerSubmenu.groups.map((group) => (
                <div key={group.heading} className="pt-6">
                  <h3 className="mb-2 font-lazzer text-[14px] font-semibold uppercase text-mp-dark-grey">
                    {group.heading}
                  </h3>
                  <ul>
                    {group.links.map((link) => (
                      <li key={link.label}>
                        <NavAnchor
                          link={link}
                          className="block py-1.5 font-lazzer text-[16px] font-medium text-mp-off-black"
                          onClick={closeDrawer}
                        >
                          {link.label}
                        </NavAnchor>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            /* 1단계: 상위 메뉴 목록 + 하단 고정 버튼 */
            <>
              <nav className="flex-1 overflow-y-auto px-6 pt-2" aria-label={tx("Mobile navigation")}>
                <ul>
                  {localizedNavItems.map((item) => (
                    <li key={item.kind === "menu" ? item.menu.label : item.link.label}>
                      {item.kind === "menu" ? (
                        <button
                          type="button"
                          className="flex w-full items-center justify-between py-3 font-lazzer text-[18px] font-semibold text-mp-off-black"
                          onClick={() => setDrawerSubmenu(item.menu)}
                        >
                          {item.menu.label}
                          <ChevronRightIcon />
                        </button>
                      ) : (
                        <NavAnchor
                          link={item.link}
                          className="block py-3 font-lazzer text-[18px] font-semibold text-mp-off-black"
                          onClick={closeDrawer}
                        >
                          {item.link.label}
                          {isExternal(item.link) ? <span aria-hidden="true"> ↗</span> : null}
                        </NavAnchor>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="flex shrink-0 flex-col gap-3 border-t border-mp-light-grey p-4">
                <Link
                  href="/login/"
                  className="flex h-12 w-full items-center justify-center rounded-pill border border-mp-off-black font-lazzer text-[16px] font-semibold text-mp-off-black transition-colors duration-200 ease-in-out hover:bg-[rgba(0,0,0,0.05)]"
                  onClick={closeDrawer}
                >
                  {dict.header.logIn}
                </Link>
                <Link
                  href="/signup/"
                  className="flex h-12 w-full items-center justify-center rounded-pill bg-mp-off-black font-lazzer text-[16px] font-semibold text-white transition-colors duration-200 ease-in-out hover:bg-[#2a2f27]"
                  onClick={closeDrawer}
                >
                  {dict.header.signUp}
                </Link>
              </div>
            </>
          )}
        </div>
      ) : null}
    </header>
  );
}
