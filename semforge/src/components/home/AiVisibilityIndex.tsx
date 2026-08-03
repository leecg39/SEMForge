"use client";

import Link from "next/link";
import { aiVisibilityIndex } from "@/data/pages/home";
import { useLocalizedValue } from "@/i18n/useLocalizedValue";

export default function AiVisibilityIndex() {
  const data = useLocalizedValue(aiVisibilityIndex);

  return (
    <section className="bg-hof py-[96px] text-white">
      <div className="mp-container grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.24px] text-rausch">
            {data.label}
          </h2>
          <h3 className="mt-3 font-lazzer text-[28px] font-semibold leading-[1.2] tracking-[-0.56px] text-white md:text-[36px]">
            {data.label}
          </h3>
          <p className="mt-6 max-w-[480px] text-[16px] leading-6 text-[#d1d2d5]">
            {data.body}
          </p>
          <Link
            href={data.cta.href}
            className="mt-10 inline-flex items-center justify-center rounded-[8px] bg-rausch px-[24px] py-3 text-[14px] font-medium text-white transition-colors duration-200 ease-in-out hover:bg-rausch-600"
          >
            {data.cta.label}
          </Link>
        </div>

        <div className="rounded-2xl bg-[rgba(255,255,255,0.06)] p-6">
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] pb-3 text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
            <span>{data.tableHead[0]}</span>
            <span>{data.tableHead[1]}</span>
          </div>
          <ol>
            {data.rows.map((row, i) => (
              <li
                key={row.brand}
                className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] py-3 last:border-b-0 last:pb-0"
              >
                <span className="flex items-baseline text-[16px] font-medium text-white">
                  <span className="w-8 shrink-0 tabular-nums">{i + 1}</span>
                  {row.brand}
                </span>
                <span className="text-[16px] font-semibold text-rausch">
                  {row.mentions}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
