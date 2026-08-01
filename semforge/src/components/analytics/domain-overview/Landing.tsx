"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { COPY, OVERVIEW_HREF, SUPPORTED_COUNTRIES } from "./copy";
import {
  getRecentDomainsServerSnapshot,
  getRecentDomainsSnapshot,
  subscribeRecentDomains,
} from "./recent";

/**
 * 도메인 개요 랜딩 — domain 파라미터 없이 진입했을 때의 검색 화면.
 * 네이티브 GET 폼으로 /analytics/overview/?domain=… 에 제출해 SSR 리포트로 이동한다.
 */
export function DomainOverviewLanding() {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const recent = useSyncExternalStore(
    subscribeRecentDomains,
    getRecentDomainsSnapshot,
    getRecentDomainsServerSnapshot,
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] p-4 sm:p-6">
      <section className="rounded-[12px] border border-app-border bg-a2-card px-5 py-10 shadow-[var(--a2-card-shadow)] sm:px-10 sm:py-14">
        <div className="mx-auto max-w-[720px] text-center">
          <h1 className="text-[28px] font-bold leading-[36px] tracking-[-0.4px] text-a2-text">
            {copy.title}
          </h1>
          <p className="mt-2 text-[14px] leading-[21px] text-a2-text-muted">{copy.landingSubtitle}</p>

          <form action={OVERVIEW_HREF} method="get" className="mt-6 flex flex-wrap justify-center gap-2">
            <input
              type="text"
              name="domain"
              required
              autoFocus
              placeholder={copy.domainPlaceholder}
              aria-label={copy.domain}
              className="h-11 min-w-0 flex-1 basis-[280px] rounded-[8px] border border-app-border bg-white px-3.5 text-[14px] text-a2-text outline-none transition-colors focus:border-app-blue"
            />
            <select
              name="country"
              defaultValue=""
              aria-label={copy.country}
              className="h-11 shrink-0 rounded-[8px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none focus:border-app-blue"
            >
              <option value="">{copy.countryAuto}</option>
              {SUPPORTED_COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-11 shrink-0 rounded-[8px] bg-[#171a26] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#2a2f3e]"
            >
              {copy.searchAction}
            </button>
          </form>

          {recent.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-a2-text-muted">
              <span className="font-medium">{copy.lastChecked}</span>
              {recent.map((entry) => (
                <Link
                  key={entry.domain}
                  href={`${OVERVIEW_HREF}?domain=${encodeURIComponent(entry.domain)}&country=${encodeURIComponent(entry.country)}`}
                  className="text-app-blue hover:underline"
                >
                  {entry.domain}
                </Link>
              ))}
            </p>
          )}
        </div>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-[10px] border border-app-border bg-a2-card p-5 shadow-[var(--a2-card-shadow)]">
          <h2 className="text-[15px] font-semibold text-a2-text">{copy.landingFeatureTitle}</h2>
          <ul className="mt-3 space-y-2">
            {copy.landingFeatureBullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2 text-[13px] leading-[19px] text-a2-text-muted">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-app-blue" />
                {bullet}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-[10px] border border-[#bce8dc] bg-[#f1fbf8] p-5">
          <h2 className="text-[15px] font-semibold text-[#087b64]">{copy.landingPrincipleTitle}</h2>
          <p className="mt-3 text-[13px] leading-[19px] text-[#3c6860]">{copy.landingPrincipleBody}</p>
        </section>
      </div>
    </div>
  );
}
