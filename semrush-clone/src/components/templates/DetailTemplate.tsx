import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FaqAccordion } from "@/components/ui/FaqAccordion";
import { cn } from "@/lib/utils";
import type { DetailPageData } from "@/types/templates";

/** 내부/외부 링크를 구분해 렌더하는 pill 링크 */
function PillLink({ href, children }: { href: string; children: React.ReactNode }) {
  const cls =
    "inline-flex items-center rounded-[100px] border border-[#d1d2d5] px-4 py-2 text-[15px] font-medium text-[#181e15] transition-colors duration-200 ease-in-out hover:bg-black/5";
  if (href.startsWith("http")) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** PUB-DETAIL: 기능/제품 상세 랜딩 템플릿 */
export function DetailTemplate({ data }: { data: DetailPageData }) {
  const finalCta = data.finalCta ?? {
    heading: "START YOUR FREE TRIAL",
    cta: { label: "Start free trial", href: "/signup/" },
  };

  return (
    <main>
      {/* 1. Hero */}
      <section className="bg-[linear-gradient(180deg,#dceeeb,#f7fbfa)] pt-20 pb-24">
        <Container>
          <div
            className={cn(
              "grid items-center gap-12",
              data.heroImage && "lg:grid-cols-2",
            )}
          >
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
              <div className="flex flex-wrap items-center gap-4">
                <Button href={data.primaryCta.href} variant="primary" size="lg">
                  {data.primaryCta.label}
                </Button>
                {data.secondaryCta && (
                  <Button
                    href={data.secondaryCta.href}
                    variant="outline"
                    size="lg"
                  >
                    {data.secondaryCta.label}
                  </Button>
                )}
              </div>
            </div>
            {data.heroImage && (
              <img
                src={data.heroImage}
                alt={data.title}
                className="w-full rounded-[16px] shadow-[0_24px_48px_-12px_rgba(24,30,21,0.16)]"
              />
            )}
          </div>
        </Container>
      </section>

      {/* 2. Benefits */}
      <section className="py-16 md:py-[120px]">
        <Container>
          <div className="grid gap-6 md:grid-cols-3">
            {data.benefits.map((item, i) => (
              <div key={i} className="rounded-[16px] bg-[#f7fbfa] p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#dceeeb] text-[22px] leading-none">
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

      {/* 3. Showcase (zig-zag) */}
      {data.showcase && data.showcase.length > 0 && (
        <section className="py-16 md:py-[120px]">
          <Container className="flex flex-col gap-20 md:gap-[120px]">
            {data.showcase.map((item, i) => (
              <div
                key={i}
                className="grid items-center gap-10 md:gap-16 lg:grid-cols-2"
              >
                <div className={cn(i % 2 === 1 && "lg:order-2")}>
                  <h2 className="font-[family-name:var(--font-lazzer)] text-[32px] font-semibold leading-[1.1] text-[#181e15]">
                    {item.heading}
                  </h2>
                  <p className="mt-4 text-[16px] leading-[1.6] text-[#6c6e79]">
                    {item.body}
                  </p>
                </div>
                <img
                  src={item.image}
                  alt={item.heading}
                  className={cn(
                    "w-full rounded-[16px]",
                    i % 2 === 1 && "lg:order-1",
                  )}
                />
              </div>
            ))}
          </Container>
        </section>
      )}

      {/* 4. Connected tools */}
      {data.connectedTools && data.connectedTools.length > 0 && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <h2 className="font-[family-name:var(--font-lazzer)] text-[24px] font-semibold text-[#181e15]">
              Works with
            </h2>
            <div className="mt-8 flex flex-wrap gap-3">
              {data.connectedTools.map((tool, i) => (
                <PillLink key={i} href={tool.href}>
                  {tool.label}
                </PillLink>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* 5. Stats */}
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

      {/* 6. Testimonials */}
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

      {/* 7. FAQ */}
      {data.faqs && data.faqs.length > 0 && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              <SectionHeader heading="FAQ" className="self-start" />
              <FaqAccordion items={data.faqs} />
            </div>
          </Container>
        </section>
      )}

      {/* 8. Final CTA */}
      <section className="py-16 md:py-[120px]">
        <Container>
          <div className="flex flex-col items-center gap-8 rounded-[24px] bg-[#dceeeb] px-8 py-16 text-center md:p-20">
            <h2 className="max-w-[720px] font-[family-name:var(--font-lazzer)] text-[32px] font-semibold uppercase leading-[1.05] tracking-[-1.2px] text-[#181e15] md:text-[40px]">
              {finalCta.heading}
            </h2>
            <Button href={finalCta.cta.href} variant="accent" size="lg">
              {finalCta.cta.label}
            </Button>
          </div>
        </Container>
      </section>
    </main>
  );
}
