"use client";

import Link from "next/link";
import { statsSection } from "@/data/pages/home";
import { useLocalizedValue } from "@/i18n/useLocalizedValue";

function ArrowUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 20V4m0 0-7 7m7-7 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const rowGridClass =
  "grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.5fr)_minmax(0,1fr)] md:items-end md:gap-8";

export default function StatsSection() {
  const section = useLocalizedValue(statsSection);
  const [first, ...rest] = section.stats;

  return (
    <section className="bg-faint py-[96px]">
      <div className="mp-container">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.24px] text-foggy">
          {section.label}
        </h2>
        <h3 className="mt-3 max-w-[980px] font-lazzer text-[28px] font-semibold leading-[1.2] tracking-[-0.56px] text-hof md:text-[36px]">
          {section.heading}
        </h3>

        <div className="mt-[60px]">
          <div
            className={`${rowGridClass} rounded-[14px] bg-hof px-6 py-8 text-white md:px-10`}
          >
            <p className="flex items-start font-lazzer text-[72px] font-medium leading-none tracking-[-0.06em] md:text-[180px] md:leading-[162px]">
              <ArrowUp className="mt-[0.1em] h-[0.36em] w-[0.36em] shrink-0" />
              <span>{first.value}</span>
            </p>
            <p className="text-[24px] font-semibold text-white">{first.unit}</p>
            <p className="text-[16px] leading-6 text-[#d1d2d5]">{first.note}</p>
          </div>

          {rest.map((stat) => (
            <div
              key={stat.unit}
              className={`${rowGridClass} group mt-4 border-t border-bebe px-6 pt-6 pb-2 md:px-10`}
            >
              <p className="flex items-start font-lazzer text-[56px] font-medium leading-none tracking-[-0.06em] text-grey-500 transition-colors duration-200 ease-in-out group-hover:text-hof md:text-[100px]">
                <ArrowUp className="mt-[0.1em] h-[0.36em] w-[0.36em] shrink-0" />
                <span>{stat.value}</span>
              </p>
              <p className="text-[24px] font-semibold text-hof">{stat.unit}</p>
              <p className="text-[16px] leading-6 text-foggy">{stat.note}</p>
            </div>
          ))}
        </div>

        <Link
          href={section.cta.href}
          className="mt-[60px] inline-flex items-center justify-center rounded-[8px] border border-hof px-[24px] py-3 text-[14px] font-medium text-hof transition-colors duration-200 ease-in-out hover:bg-hof hover:text-white"
        >
          {section.cta.label}
        </Link>
      </div>
    </section>
  );
}
