"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { parseGapTargetParam } from "@/lib/analytics/keyword-gap";
import { COPY, KEYWORD_GAP_HREF, TARGET_COLORS } from "./copy";
import {
  getRecentGapsServerSnapshot,
  getRecentGapsSnapshot,
  recentGapQuery,
  subscribeRecentGaps,
} from "./recent";
import { GapTargetForm } from "./TargetForm";

/** 입력 폼 모형 미니 일러스트 (원본 에셋 미복사, 유사 무드 자체 제작). */
function EnterIllustration() {
  return (
    <svg width="150" height="96" viewBox="0 0 150 96" aria-hidden>
      <rect x="6" y="14" width="138" height="68" rx="8" fill="#fdeef0" />
      <rect x="16" y="26" width="88" height="14" rx="3" fill="#fff" stroke="#d8dbe2" />
      <rect x="19" y="29" width="16" height="8" rx="2" fill={TARGET_COLORS[0]} opacity="0.85" />
      <rect x="108" y="26" width="26" height="14" rx="3" fill="#fff" stroke="#d8dbe2" />
      <rect x="16" y="46" width="88" height="14" rx="3" fill="#fff" stroke="#d8dbe2" />
      <circle cx="24" cy="53" r="3.5" fill={TARGET_COLORS[1]} />
      <rect x="108" y="46" width="26" height="14" rx="3" fill="#fff" stroke="#d8dbe2" />
      <rect x="97" y="66" width="37" height="13" rx="3" fill="#171a26" />
      <rect x="103" y="71" width="25" height="3" rx="1.5" fill="#fff" opacity="0.85" />
    </svg>
  );
}

/** 키워드 겹침 벤 미니 일러스트. */
function OverlapIllustration() {
  return (
    <svg width="150" height="96" viewBox="0 0 150 96" aria-hidden>
      <rect x="6" y="10" width="138" height="76" rx="8" fill="#fdf6e5" />
      <circle cx="58" cy="48" r="24" fill={TARGET_COLORS[0]} opacity="0.45" />
      <circle cx="82" cy="48" r="17" fill={TARGET_COLORS[1]} opacity="0.5" />
      <circle cx="72" cy="62" r="12" fill={TARGET_COLORS[3]} opacity="0.5" />
      <rect x="106" y="34" width="30" height="4" rx="2" fill="#c9cdd6" />
      <rect x="106" y="46" width="24" height="4" rx="2" fill="#c9cdd6" />
      <rect x="106" y="58" width="27" height="4" rx="2" fill="#c9cdd6" />
    </svg>
  );
}

/** 기회 테이블 미니 일러스트. */
function InsightIllustration() {
  return (
    <svg width="150" height="96" viewBox="0 0 150 96" aria-hidden>
      <rect x="6" y="10" width="138" height="76" rx="8" fill="#efeafd" />
      <rect x="16" y="22" width="118" height="52" rx="4" fill="#fff" stroke="#d8dbe2" />
      <line x1="16" y1="38" x2="134" y2="38" stroke="#e2e5ea" />
      <line x1="16" y1="50" x2="134" y2="50" stroke="#e2e5ea" />
      <line x1="16" y1="62" x2="134" y2="62" stroke="#e2e5ea" />
      <rect x="22" y="42" width="28" height="4" rx="2" fill="#235fe2" />
      <rect x="22" y="54" width="34" height="4" rx="2" fill="#235fe2" />
      <rect x="22" y="66" width="24" height="4" rx="2" fill="#235fe2" />
      <rect x="86" y="42" width="20" height="4" rx="2" fill="#59ddaa" />
      <rect x="86" y="54" width="30" height="4" rx="2" fill="#59ddaa" />
      <rect x="86" y="66" width="16" height="4" rx="2" fill="#fdc23c" />
    </svg>
  );
}

/**
 * 키워드 갭 랜딩 — 대상 파라미터 없이 진입했을 때의 입력 화면.
 * 원본(스크린샷 1) 구성: 히어로 + 다중 도메인 입력 카드 + 사용법 3블록.
 */
export function KeywordGapLanding() {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const recent = useSyncExternalStore(
    subscribeRecentGaps,
    getRecentGapsSnapshot,
    getRecentGapsServerSnapshot,
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] p-4 sm:p-6">
      <section className="rounded-[12px] border border-app-border bg-a2-card px-5 py-10 shadow-[var(--a2-card-shadow)] sm:px-10 sm:py-12">
        <div className="mx-auto max-w-[760px]">
          <div className="text-center">
            <h1 className="text-[28px] font-bold leading-[36px] tracking-[-0.4px] text-a2-text">
              {copy.title}
            </h1>
            <p className="mt-2 text-[14px] leading-[21px] text-a2-text-muted">
              {copy.landingSubtitle}
            </p>
          </div>
          <div className="mt-6">
            <GapTargetForm copy={copy} variant="landing" />
          </div>

          {recent.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-a2-text-muted">
              <span className="font-medium">{copy.lastChecked}</span>
              {recent.map((entry) => {
                const you = parseGapTargetParam(entry.targets[0]);
                const label = you?.value ?? entry.targets[0];
                const extra = entry.targets.length - 1;
                return (
                  <Link
                    key={`${entry.country}|${entry.targets.join(",")}`}
                    href={`${KEYWORD_GAP_HREF}?${recentGapQuery(entry)}`}
                    className="text-app-blue hover:underline"
                  >
                    {label} vs {extra > 1 ? `${copy.andMore} ${extra}` : parseGapTargetParam(entry.targets[1])?.value ?? entry.targets[1]}
                  </Link>
                );
              })}
            </p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-[12px] border border-app-border bg-a2-card px-5 py-8 shadow-[var(--a2-card-shadow)] sm:px-10">
        <div className="mx-auto flex max-w-[760px] flex-col gap-10">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <EnterIllustration />
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold text-a2-text">{copy.howEnterTitle}</h2>
              <p className="mt-1.5 text-[13px] leading-[20px] text-a2-text-muted">
                {copy.howEnterBody}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-5 sm:flex-row-reverse sm:items-center">
            <OverlapIllustration />
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold text-a2-text">{copy.howTypeTitle}</h2>
              <p className="mt-1.5 text-[13px] leading-[20px] text-a2-text-muted">
                {copy.howTypeBody}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <InsightIllustration />
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold text-a2-text">{copy.howInsightTitle}</h2>
              <p className="mt-1.5 text-[13px] leading-[20px] text-a2-text-muted">
                {copy.howInsightBody}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[10px] border border-[#bce8dc] bg-[#f1fbf8] p-5">
        <h2 className="text-[15px] font-semibold text-[#087b64]">{copy.principleTitle}</h2>
        <p className="mt-2 text-[13px] leading-[19px] text-[#3c6860]">{copy.principleBody}</p>
      </section>
    </div>
  );
}
