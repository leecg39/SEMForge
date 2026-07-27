"use client";

import { useState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FaqAccordion } from "@/components/ui/FaqAccordion";
import { cn } from "@/lib/utils";
import type { PricingPageData } from "@/types/templates";

function CellValue({ value }: { value: string }) {
  if (value === "✓") {
    return <span className="font-bold text-[#18f0bf]">✓</span>;
  }
  if (value === "—" || value === "-") {
    return <span className="text-[#d1d2d5]">—</span>;
  }
  return <>{value}</>;
}

/**
 * 연간 결제 할인율.
 * 원본에서 실제 할인율을 관찰하지는 못했고, 플랜 금액 자체도 중립 플레이스홀더이므로
 * 토글이 금액에 반영된다는 동작만 재현하기 위한 값이다.
 */
const ANNUAL_DISCOUNT = 0.17;

/** "$99" → 연간 환산 "$986". 숫자가 아닌 값(Custom, Free 등)은 그대로 둔다. */
function priceFor(price: string, billing: "monthly" | "annual"): string {
  if (billing === "monthly") return price;
  const match = price.match(/^([^\d]*)([\d,.]+)(.*)$/);
  if (!match) return price;
  const [, prefix, digits, suffix] = match;
  const amount = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount === 0) return price;
  const yearly = Math.round(amount * 12 * (1 - ANNUAL_DISCOUNT));
  return `${prefix}${yearly.toLocaleString("en-US")}${suffix}`;
}

export function PricingTemplate({ data }: { data: PricingPageData }) {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const periodLabel = billing === "monthly" ? "/mo" : "/yr";

  const planGridCols =
    data.plans.length >= 4
      ? "lg:grid-cols-4"
      : data.plans.length === 3
        ? "lg:grid-cols-3"
        : "lg:grid-cols-2";

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-[#f7fbfa] py-16 md:py-[80px]">
        <Container className="flex flex-col items-center gap-5 text-center">
          <h1 className="font-[family-name:var(--font-lazzer)] text-[36px] font-semibold leading-[1.05] tracking-[-1.2px] text-[#181e15] md:text-[56px] md:tracking-[-2.24px]">
            {data.title}
          </h1>
          <p className="max-w-[640px] text-[18px] leading-[1.5] text-[#6c6e79]">
            {data.subtitle}
          </p>
        </Container>
      </section>

      {/* Toolkits + billing toggle + plans */}
      <section className="py-16 md:py-[120px]">
        <Container>
          {data.toolkits && data.toolkits.length > 0 && (
            <div className="mb-10 flex flex-wrap justify-center gap-2">
              {data.toolkits.map((toolkit) => (
                <Link
                  key={toolkit.label}
                  href={toolkit.href}
                  className={cn(
                    "inline-flex h-10 items-center rounded-full px-5 text-[14px] font-semibold transition-colors duration-200 ease-in-out",
                    toolkit.active
                      ? "bg-[#181e15] text-white"
                      : "border border-[#e0e1e9] bg-white text-[#181e15] hover:border-[#181e15]",
                  )}
                >
                  {toolkit.label}
                </Link>
              ))}
            </div>
          )}

          <div className="mb-12 flex justify-center">
            <div className="flex items-center gap-1 rounded-[100px] bg-[#f0f1f2] p-1">
              <button
                type="button"
                aria-pressed={billing === "monthly"}
                onClick={() => setBilling("monthly")}
                className={cn(
                  "h-10 cursor-pointer rounded-[100px] px-5 text-[14px] font-semibold transition-colors duration-200 ease-in-out",
                  billing === "monthly"
                    ? "bg-white text-[#181e15] shadow-glass"
                    : "text-[#6c6e79]",
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                aria-pressed={billing === "annual"}
                onClick={() => setBilling("annual")}
                className={cn(
                  "flex h-10 cursor-pointer items-center gap-2 rounded-[100px] px-5 text-[14px] font-semibold transition-colors duration-200 ease-in-out",
                  billing === "annual"
                    ? "bg-white text-[#181e15] shadow-glass"
                    : "text-[#6c6e79]",
                )}
              >
                Annual
                {billing === "annual" && (
                  <span className="rounded-full bg-[#89ff75] px-2 py-0.5 text-[11px] font-semibold text-[#181e15]">
                    Save 17%
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className={cn("grid grid-cols-1 gap-6 md:grid-cols-2", planGridCols)}>
            {data.plans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative flex flex-col rounded-[20px] bg-white p-8",
                  plan.highlight
                    ? "border-2 border-[#c190ff]"
                    : "border border-[#e0e1e9]",
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-[13px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#c190ff] px-3.5 py-1 text-[12px] font-semibold uppercase tracking-[0.24px] text-[#181e15]">
                    Most popular
                  </span>
                )}
                <h2 className="font-[family-name:var(--font-lazzer)] text-[22px] font-semibold text-[#181e15]">
                  {plan.name}
                </h2>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-[family-name:var(--font-lazzer)] text-[48px] font-semibold leading-none tracking-[-1.5px] text-[#181e15]">
                    {priceFor(plan.price, billing)}
                  </span>
                  {plan.period && (
                    <span className="text-[14px] text-[#6c6e79]">{periodLabel}</span>
                  )}
                </div>
                {plan.period && billing === "annual" && (
                  <p className="mt-1 text-[13px] text-[#6c6e79]">
                    월 {plan.price} 대비 {Math.round(ANNUAL_DISCOUNT * 100)}% 절약
                  </p>
                )}
                <p className="mt-3 text-[14px] leading-[1.5] text-[#6c6e79]">
                  {plan.tagline}
                </p>
                <div className="my-6 border-t border-[#f0f1f2]" />
                <ul className="flex flex-col gap-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-[15px] leading-[1.5] text-[#181e15]"
                    >
                      <span className="mt-px font-bold text-[#18f0bf]">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  <Button
                    href={plan.cta.href}
                    variant={plan.highlight ? "accent" : "outline"}
                    className="w-full"
                  >
                    {plan.cta.label}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Comparison table */}
      {data.comparison && data.comparison.length > 0 && (
        <section className="pb-16 md:pb-[120px]">
          <Container>
            <SectionHeader heading="Compare plans" align="center" className="mb-12" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#181e15]">
                    <th className="sticky left-0 z-10 min-w-[220px] bg-white py-4 pr-6">
                      <span className="sr-only">Feature</span>
                    </th>
                    {data.plans.map((plan) => (
                      <th
                        key={plan.name}
                        className="min-w-[140px] px-4 py-4 text-center font-[family-name:var(--font-lazzer)] text-[16px] font-semibold text-[#181e15]"
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                {data.comparison.map((section) => (
                  <tbody key={section.section}>
                    <tr>
                      <th
                        colSpan={data.plans.length + 1}
                        className="pb-4 pt-10 text-left font-[family-name:var(--font-lazzer)] text-[20px] font-semibold text-[#181e15]"
                      >
                        {section.section}
                      </th>
                    </tr>
                    {section.rows.map((row) => (
                      <tr key={row.label} className="border-b border-[#f0f1f2]">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-white py-4 pr-6 text-left text-[14px] font-medium text-[#181e15]"
                        >
                          {row.label}
                        </th>
                        {row.values.map((value, i) => (
                          <td
                            key={i}
                            className="px-4 py-4 text-center text-[14px] text-[#181e15]"
                          >
                            <CellValue value={value} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Container>
        </section>
      )}

      {/* FAQ */}
      {data.faqs && data.faqs.length > 0 && (
        <section className="pb-16 md:pb-[120px]">
          <Container>
            <div className="mx-auto max-w-[800px]">
              <SectionHeader
                heading="Frequently asked questions"
                align="center"
                className="mb-10"
              />
              <FaqAccordion items={data.faqs} />
            </div>
          </Container>
        </section>
      )}

      {/* Enterprise CTA band */}
      <section className="bg-[#181e15] py-16 md:py-[120px]">
        <Container className="flex flex-col items-center gap-8 text-center">
          <SectionHeader heading="Need a custom plan?" align="center" invert />
          <Button variant="accent" size="lg" href="/company/sales/">
            Contact sales
          </Button>
        </Container>
      </section>
    </div>
  );
}
