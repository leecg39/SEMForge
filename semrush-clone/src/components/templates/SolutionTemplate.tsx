"use client";

import Link from "next/link";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FaqAccordion } from "@/components/ui/FaqAccordion";
import type { SolutionPageData } from "@/types/templates";

/** 추천 기능 카드 — 내부/외부 링크 구분 */
function FeatureCard({
  label,
  href,
  body,
}: {
  label: string;
  href: string;
  body: string;
}) {
  const cls =
    "group flex flex-col rounded-[16px] border border-[#f0f1f2] p-8 transition-colors duration-200 ease-in-out hover:border-[#d1d2d5]";
  const inner = (
    <>
      <h3 className="font-[family-name:var(--font-lazzer)] text-[20px] font-semibold text-[#181e15]">
        {label}
      </h3>
      <p className="mt-3 text-[15px] leading-[1.6] text-[#6c6e79]">{body}</p>
      <span className="mt-auto pt-6 text-[15px] font-semibold text-[#181e15]">
        Learn more{" "}
        <span className="inline-block transition-transform duration-200 ease-in-out group-hover:translate-x-1">
          →
        </span>
      </span>
    </>
  );
  if (href.startsWith("http")) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/** PUB-SOLUTION: 역할/문제/산업 솔루션 랜딩 템플릿 */
export function SolutionTemplate({ data: sourceData }: { data: SolutionPageData }) {
  const data = useLocalizedValue(sourceData);
  const tx = useSiteText();
  return (
    <main>
      {/* 1. Hero */}
      <section className="bg-[linear-gradient(180deg,#e8e1ff,#f7fbfa)] pt-20 pb-24">
        <Container>
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col items-start gap-6">
              {data.eyebrow && (
                <span className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
                  {data.eyebrow}
                </span>
              )}
              <h1 className="font-[family-name:var(--font-lazzer)] text-[40px] font-semibold leading-[1.05] tracking-[-2px] text-[#181e15] md:text-[56px]">
                {data.title}
              </h1>
              <p className="max-w-[520px] text-[18px] leading-[1.6] text-[#6c6e79]">
                {data.subtitle}
              </p>
              <Button href={data.primaryCta.href} variant="primary" size="lg">
                {data.primaryCta.label}
              </Button>
            </div>
            {/* 추상 일러스트 자리 (장식용) */}
            <div
              aria-hidden="true"
              className="relative hidden h-[360px] overflow-hidden rounded-[24px] bg-[#c190ff]/20 lg:block"
            >
              <div className="absolute left-12 top-14 h-24 w-24 rounded-full bg-[#c190ff]/70" />
              <div className="absolute right-14 top-10 h-16 w-16 rounded-full bg-[#181e15]" />
              <div className="absolute bottom-12 right-20 h-28 w-28 rounded-[24px] bg-[#18f0bf]/60" />
              <div className="absolute bottom-16 left-16 h-10 w-44 rounded-[100px] bg-white/80" />
              <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rotate-12 rounded-[16px] bg-[#89ff75]/70" />
            </div>
          </div>
        </Container>
      </section>

      {/* 2. Problems */}
      {data.problems && data.problems.length > 0 && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <SectionHeader heading={tx("Challenges we solve")} />
            <div className="mt-12 grid gap-6 md:mt-16 md:grid-cols-2">
              {data.problems.map((item, i) => (
                <div key={i} className="rounded-[16px] bg-[#f7fbfa] p-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8e1ff] text-[22px] leading-none">
                    {item.icon}
                  </div>
                  <h3 className="mt-6 font-[family-name:var(--font-lazzer)] text-[20px] font-semibold text-[#181e15]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.6] text-[#6c6e79]">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* 3. Workflow */}
      {data.workflow && data.workflow.length > 0 && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <div className="grid gap-10 sm:grid-cols-2 lg:auto-cols-fr lg:grid-flow-col">
              {data.workflow.map((step, i) => (
                <div key={i} className="flex flex-col items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#181e15] font-[family-name:var(--font-lazzer)] text-[18px] font-semibold text-white">
                    {step.step}
                  </div>
                  <h3 className="font-[family-name:var(--font-lazzer)] text-[20px] font-semibold text-[#181e15]">
                    {step.title}
                  </h3>
                  <p className="text-[15px] leading-[1.6] text-[#6c6e79]">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* 4. Recommended features */}
      {data.recommendedFeatures && data.recommendedFeatures.length > 0 && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.recommendedFeatures.map((feature, i) => (
                <FeatureCard
                  key={i}
                  label={feature.label}
                  href={feature.href}
                  body={feature.body}
                />
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* 5a. Stats */}
      {data.stats && data.stats.length > 0 && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-10 rounded-[24px] bg-[#181e15] p-12">
              {data.stats.map((stat, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <span className="font-[family-name:var(--font-lazzer)] text-[56px] font-semibold leading-[1.05] tracking-[-2px] text-white">
                    {stat.value}
                  </span>
                  <span className="text-[14px] text-[#d1d2d5]">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* 5b. Testimonials */}
      {data.testimonials && data.testimonials.length > 0 && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.testimonials.map((t, i) => (
                <figure
                  key={i}
                  className="flex flex-col gap-6 rounded-[16px] bg-[#f3f6f6] p-8"
                >
                  <blockquote className="text-[18px] leading-[1.5] text-[#181e15]">
                    {t.quote}
                  </blockquote>
                  <figcaption className="mt-auto">
                    <div className="text-[15px] font-semibold text-[#181e15]">
                      {t.author}
                    </div>
                    <div className="mt-1 text-[14px] text-[#6c6e79]">
                      {t.role}
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* 5c. FAQ */}
      {data.faqs && data.faqs.length > 0 && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              <SectionHeader heading={tx("FAQ")} className="self-start" />
              <FaqAccordion items={data.faqs} />
            </div>
          </Container>
        </section>
      )}

      {/* 6. Final CTA */}
      <section className="py-16 md:py-[120px]">
        <Container>
          <div className="flex flex-col items-center gap-8 rounded-[24px] bg-[#c190ff] px-8 py-16 text-center md:p-20">
            <h2 className="max-w-[720px] font-[family-name:var(--font-lazzer)] text-[32px] font-semibold uppercase leading-[1.05] tracking-[-1.2px] text-[#181e15] md:text-[40px]">
              READY TO GROW?
            </h2>
            <Button href={data.primaryCta.href} variant="dark" size="lg">
              {data.primaryCta.label}
            </Button>
          </div>
        </Container>
      </section>
    </main>
  );
}
