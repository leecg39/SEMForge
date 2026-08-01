import Link from "next/link";
import { POSITION_TRACKING_TABS } from "@/components/position-tracking/tabs";

interface Props {
  /** 현재 선택된 탭 slug. */
  activeSlug: string;
  /** 탭 링크에 유지할 기존 쿼리(캠페인·프로젝트 등). tab 키는 제외한다. */
  baseQuery: Record<string, string>;
}

function hrefFor(slug: string, baseQuery: Record<string, string>): string {
  const params = new URLSearchParams(baseQuery);
  params.set("tab", slug);
  return `/position-tracking/?${params.toString()}`;
}

/** 포지션 추적 탭 내비게이션. 준비 중 탭도 숨기지 않고 상태를 드러낸다. */
export function PositionTrackingTabs({ activeSlug, baseQuery }: Props) {
  return (
    <nav aria-label="포지션 추적 보기" className="border-b border-app-border">
      <ul className="flex flex-wrap items-center gap-x-1 gap-y-1 overflow-x-auto">
        {POSITION_TRACKING_TABS.map((tab) => {
          const active = tab.slug === activeSlug;
          return (
            <li key={tab.slug}>
              <Link
                href={hrefFor(tab.slug, baseQuery)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? "border-app-link font-semibold text-app-link"
                    : "border-transparent text-app-text-secondary hover:text-app-text"
                }`}
              >
                {tab.label}
                {tab.status === "pending" && (
                  <span
                    className="rounded-[4px] bg-app-bg px-1 py-[1px] text-[10px] font-medium text-app-text-secondary"
                    title={tab.reason}
                  >
                    준비 중
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 데이터 소스가 아직 없는 탭의 정직한 안내. */
export function PositionTrackingPendingTab({ label, reason }: { label: string; reason: string }) {
  return (
    <section
      aria-labelledby="pt-pending-heading"
      className="mt-4 rounded-[10px] border border-app-border bg-white p-6"
    >
      <h2 id="pt-pending-heading" className="text-[15px] font-semibold">
        {label}
      </h2>
      <span className="mt-2 inline-flex items-center rounded-[4px] bg-app-bg px-2 py-[2px] text-[11px] font-medium text-app-text-secondary">
        데이터 소스 준비 중
      </span>
      <p className="mt-3 max-w-2xl text-[13px] leading-6 text-app-text-secondary">{reason}</p>
      <p className="mt-2 text-[12px] text-app-text-secondary">
        SEMForge는 실제 수집 데이터가 없는 지표를 가짜 숫자로 채우지 않습니다.
      </p>
    </section>
  );
}
