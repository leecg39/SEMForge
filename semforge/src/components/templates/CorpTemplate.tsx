"use client";

import { Container } from "@/components/ui/Container";
import { useLocalizedValue } from "@/i18n/useLocalizedValue";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FaqAccordion } from "@/components/ui/FaqAccordion";
import { cn } from "@/lib/utils";
import type { CorpPageData } from "@/types/templates";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

type CorpBodyBlock = NonNullable<CorpPageData["body"]>[number];

function BodyBlocks({ blocks }: { blocks: CorpBodyBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={i}
                id={slugify(block.text ?? "")}
                className="mb-4 mt-10 scroll-mt-24 font-[family-name:var(--font-lazzer)] text-[28px] font-semibold leading-[1.15] text-[#181e15] first:mt-0"
              >
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={i}
                className="mb-3 mt-8 text-[20px] font-semibold leading-[1.25] text-[#181e15] first:mt-0"
              >
                {block.text}
              </h3>
            );
          case "ul":
            return (
              <ul
                key={i}
                className="mb-5 list-disc space-y-2 pl-6 text-[16px] leading-[1.7] text-[#333]"
              >
                {block.items?.map((item, j) => <li key={j}>{item}</li>)}
              </ul>
            );
          default:
            return (
              <p key={i} className="mb-5 text-[16px] leading-[1.7] text-[#333]">
                {block.text}
              </p>
            );
        }
      })}
    </>
  );
}

function FormField({
  field,
}: {
  field: { label: string; type: string; name: string };
}) {
  const inputCls =
    "w-full rounded-[8px] border border-[#d1d2d5] bg-white px-3 text-[14px] text-[#181e15] outline-none transition-colors duration-200 ease-in-out placeholder:text-[#9a9ca5] focus:border-[#181e15]";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={field.name} className="text-[14px] font-semibold text-[#181e15]">
        {field.label}
      </label>
      {field.type === "textarea" ? (
        <textarea
          id={field.name}
          name={field.name}
          rows={4}
          className={cn(inputCls, "py-3")}
        />
      ) : field.type === "select" ? (
        <select id={field.name} name={field.name} className={cn(inputCls, "h-11")}>
          <option value="">Please select</option>
        </select>
      ) : (
        <input
          id={field.name}
          name={field.name}
          type={field.type}
          className={cn(inputCls, "h-11")}
        />
      )}
    </div>
  );
}

export function CorpTemplate({ data: sourceData }: { data: CorpPageData }) {
  const data = useLocalizedValue(sourceData);
  const variant = data.variant ?? "about";
  const isContactLike = variant === "contact" || variant === "sales";
  const isAboutLike = variant === "about" || variant === "partners";
  const hasBody = Boolean(data.body && data.body.length > 0);

  const statsCols =
    data.stats && data.stats.length >= 4
      ? "md:grid-cols-4"
      : data.stats && data.stats.length === 3
        ? "md:grid-cols-3"
        : "md:grid-cols-2";

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-[#f7fbfa] py-[64px]">
        <Container>
          <h1 className="font-[family-name:var(--font-lazzer)] text-[32px] font-semibold leading-[1.1] tracking-[-1px] text-[#181e15] md:text-[48px] md:tracking-[-1.8px]">
            {data.title}
          </h1>
          {data.subtitle && (
            <p className="mt-4 max-w-[640px] text-[18px] leading-[1.5] text-[#6c6e79]">
              {data.subtitle}
            </p>
          )}
        </Container>
      </section>

      {/* Contact / Sales: description + form */}
      {isContactLike && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <div
              className={cn(
                "grid gap-12",
                data.form && "lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-20",
              )}
            >
              <div>
                {data.body && data.body.length > 0 && (
                  <div className="max-w-[640px]">
                    <BodyBlocks blocks={data.body} />
                  </div>
                )}
                {data.stats && data.stats.length > 0 && (
                  <div className={cn("grid grid-cols-2 gap-8", hasBody && "mt-12")}>
                    {data.stats.map((stat) => (
                      <div key={stat.label}>
                        <div className="font-[family-name:var(--font-lazzer)] text-[32px] font-semibold tracking-[-1px] text-[#181e15]">
                          {stat.value}
                        </div>
                        <div className="mt-1 text-[14px] text-[#6c6e79]">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {data.form && (
                <div className="h-fit rounded-[16px] border border-[#e0e1e9] bg-white p-8 shadow-glass">
                  {/* 서버 컴포넌트라 form 대신 div — 제출 버튼은 no-op */}
                  <div className="flex flex-col gap-5">
                    {data.form.fields.map((field) => (
                      <FormField key={field.name} field={field} />
                    ))}
                    <Button variant="primary" className="w-full">
                      {data.form.submit}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Container>
        </section>
      )}

      {/* About / Partners: body */}
      {isAboutLike && hasBody && data.body && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <div className="max-w-[800px]">
              <BodyBlocks blocks={data.body} />
            </div>
          </Container>
        </section>
      )}

      {/* About / Partners: stats band */}
      {isAboutLike && data.stats && data.stats.length > 0 && (
        <section
          className={cn(
            "pb-16 md:pb-[120px]",
            !hasBody && "pt-16 md:pt-[120px]",
          )}
        >
          <Container>
            <div className="rounded-[24px] bg-[#dceeeb] p-8 md:p-12">
              <div className={cn("grid grid-cols-2 gap-10", statsCols)}>
                {data.stats.map((stat) => (
                  <div key={stat.label}>
                    <div className="font-[family-name:var(--font-lazzer)] text-[36px] font-semibold tracking-[-1px] text-[#181e15] md:text-[48px] md:tracking-[-1.5px]">
                      {stat.value}
                    </div>
                    <div className="mt-2 text-[14px] text-[#6c6e79]">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Container>
        </section>
      )}

      {/* Legal: narrow body */}
      {variant === "legal" && hasBody && data.body && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <div className="mx-auto max-w-[760px]">
              <BodyBlocks blocks={data.body} />
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
    </div>
  );
}
