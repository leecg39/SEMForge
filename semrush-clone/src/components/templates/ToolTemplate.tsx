"use client";

import { useState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FaqAccordion } from "@/components/ui/FaqAccordion";
import type { ToolPageData } from "@/types/templates";

export function ToolTemplate({ data }: { data: ToolPageData }) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <main>
      {/* Hero + input card */}
      <section className="bg-[linear-gradient(180deg,#dceeeb,#f7fbfa)] py-[64px] md:py-[80px]">
        <Container className="flex flex-col items-center gap-4 text-center">
          {data.eyebrow && (
            <span className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
              {data.eyebrow}
            </span>
          )}
          <h1 className="font-[family-name:var(--font-lazzer)] text-[36px] font-semibold leading-[1.05] tracking-[-1.2px] text-[#181e15] md:text-[48px] md:tracking-[-1.8px]">
            {data.title}
          </h1>
          <p className="max-w-[640px] text-[18px] leading-[1.5] text-[#6c6e79]">
            {data.subtitle}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
            }}
            className="mt-6 flex w-full max-w-[640px] flex-col gap-2 rounded-[16px] bg-white p-3 shadow-[0_2px_12px_0_rgba(0,0,0,0.05)] sm:flex-row"
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={data.inputPlaceholder}
              aria-label={data.inputPlaceholder}
              className="h-[56px] flex-1 rounded-[10px] bg-transparent px-5 text-left text-[16px] text-[#181e15] outline-none placeholder:text-[#6c6e79] focus:bg-[#f7fbfa]"
            />
            <Button variant="accent" size="lg">
              {data.submitLabel}
            </Button>
          </form>
        </Container>
      </section>

      {/* Result preview (shown after submit) */}
      {submitted && data.resultPreview && (
        <section className="pt-[48px] md:pt-[64px]">
          <Container>
            <div className="mx-auto flex max-w-[840px] flex-col items-center gap-8 rounded-[12px] bg-[#f3f6f6] p-8 md:flex-row md:items-start">
              <div className="relative h-[120px] w-[120px] shrink-0">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="#d1d2d5"
                    strokeWidth="10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="#c190ff"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray="255 327"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-[family-name:var(--font-lazzer)] text-[28px] font-semibold text-[#181e15]">
                  78
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 text-left font-mono text-[14px] leading-[1.7] text-[#181e15]">
                <span className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
                  Result preview
                </span>
                <p className="text-[#6c6e79]">{`> ${query || data.inputPlaceholder}`}</p>
                <p className="whitespace-pre-line">{data.resultPreview}</p>
              </div>
            </div>
          </Container>
        </section>
      )}

      {/* How it works */}
      {data.howItWorks && data.howItWorks.length > 0 && (
        <section className="py-[64px] md:py-[120px]">
          <Container>
            <SectionHeader heading="How it works" />
            <div className="mt-10 grid grid-cols-1 gap-6 md:mt-12 md:grid-cols-3">
              {data.howItWorks.map((step, i) => (
                <div
                  key={step.title}
                  className="flex flex-col gap-4 rounded-[16px] border border-[#f0f1f2] p-6"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dceeeb] font-[family-name:var(--font-lazzer)] text-[16px] font-semibold text-[#181e15]">
                    {i + 1}
                  </span>
                  <h3 className="font-[family-name:var(--font-lazzer)] text-[20px] font-semibold text-[#181e15]">
                    {step.title}
                  </h3>
                  <p className="text-[15px] leading-[1.5] text-[#6c6e79]">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* FAQ */}
      {data.faqs && data.faqs.length > 0 && (
        <section className="pb-[64px] md:pb-[120px]">
          <Container className="max-w-[904px]">
            <SectionHeader heading="FAQ" />
            <div className="mt-8">
              <FaqAccordion items={data.faqs} />
            </div>
          </Container>
        </section>
      )}

      {/* Related tools */}
      {data.relatedTools && data.relatedTools.length > 0 && (
        <section className="pb-[64px] md:pb-[120px]">
          <Container>
            <SectionHeader heading="Related tools" />
            <div className="mt-8 flex flex-wrap gap-3">
              {data.relatedTools.map((tool) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="rounded-full border border-[#d1d2d5] px-5 py-2.5 text-[15px] font-semibold text-[#181e15] transition-colors duration-200 ease-in-out hover:border-[#181e15]"
                >
                  {tool.label}
                </Link>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Signup CTA band */}
      <section className="bg-[#181e15] py-[64px] md:py-[120px]">
        <Container className="flex flex-col items-center gap-8 text-center">
          <SectionHeader
            heading="Get more with a free account"
            align="center"
            invert
          />
          <Button href="/signup/" variant="accent" size="lg">
            Sign up free
          </Button>
        </Container>
      </section>
    </main>
  );
}
