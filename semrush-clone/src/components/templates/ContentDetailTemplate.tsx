import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/utils";
import type { ContentDetailData, HubCard } from "@/types/templates";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

type BodyBlock = ContentDetailData["body"][number];

function BodyBlocks({ blocks }: { blocks: BodyBlock[] }) {
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
          case "quote":
            return (
              <blockquote
                key={i}
                className="mb-5 border-l-4 border-[#c190ff] pl-6 text-[18px] italic leading-[1.6] text-[#181e15]"
              >
                {block.text}
              </blockquote>
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

function RelatedCard({ card }: { card: HubCard }) {
  return (
    <Link
      href={card.href}
      className="group flex flex-col rounded-[20px] border border-[#e0e1e9] bg-white p-6 transition-colors duration-200 ease-in-out hover:border-[#181e15]"
    >
      {card.tag && (
        <span className="mb-3 text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
          {card.tag}
        </span>
      )}
      <h3 className="font-[family-name:var(--font-lazzer)] text-[20px] font-semibold leading-[1.25] text-[#181e15]">
        {card.title}
      </h3>
      {card.body && (
        <p className="mt-2 text-[14px] leading-[1.6] text-[#6c6e79]">{card.body}</p>
      )}
      <span className="mt-auto pt-5 text-[14px] font-semibold text-[#181e15] group-hover:underline">
        Read more →
      </span>
    </Link>
  );
}

export function ContentDetailTemplate({ data }: { data: ContentDetailData }) {
  const meta = [data.author, data.date, data.readingTime].filter(Boolean);
  const hasToc = Boolean(data.toc && data.toc.length > 0);

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-[#f7fbfa] py-[64px]">
        <Container>
          {data.category && (
            <div className="mb-4 text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
              {data.category}
            </div>
          )}
          <h1 className="max-w-[800px] font-[family-name:var(--font-lazzer)] text-[32px] font-semibold leading-[1.1] tracking-[-1px] text-[#181e15] md:text-[44px] md:tracking-[-1.6px]">
            {data.title}
          </h1>
          {meta.length > 0 && (
            <div className="mt-5 text-[14px] text-[#6c6e79]">{meta.join(" · ")}</div>
          )}
        </Container>
      </section>

      {/* Body + TOC */}
      <section className="py-16">
        <Container>
          <div
            className={cn(
              "grid gap-12",
              hasToc && "lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-16",
            )}
          >
            <div className="max-w-[820px]">
              <BodyBlocks blocks={data.body} />
            </div>
            {data.toc && data.toc.length > 0 && (
              <aside className="hidden lg:block">
                <div className="sticky top-24">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#181e15]">
                    On this page
                  </div>
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {data.toc.map((item) => (
                      <li key={item}>
                        <a
                          href={`#${slugify(item)}`}
                          className="text-[14px] leading-[1.4] text-[#6c6e79] transition-colors duration-200 ease-in-out hover:text-[#181e15]"
                        >
                          {item}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            )}
          </div>
        </Container>
      </section>

      {/* Related */}
      {data.related && data.related.length > 0 && (
        <section className="py-16 md:py-[120px]">
          <Container>
            <SectionHeader heading="Related" className="mb-10" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {data.related.map((card) => (
                <RelatedCard key={card.href} card={card} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Newsletter CTA band */}
      <section className="pb-16 md:pb-[120px]">
        <Container>
          <div className="flex flex-col items-center gap-6 rounded-[24px] bg-[#dceeeb] px-6 py-14 text-center md:py-16">
            <h2 className="max-w-[560px] font-[family-name:var(--font-lazzer)] text-[28px] font-semibold leading-[1.1] tracking-[-1px] text-[#181e15] md:text-[36px]">
              Get weekly insights in your inbox
            </h2>
            <div className="flex w-full max-w-[480px] flex-col gap-3 sm:flex-row">
              <input
                type="email"
                placeholder="Enter your email"
                className="h-12 min-w-0 flex-1 rounded-full border border-[#d1d2d5] bg-white px-5 text-[15px] text-[#181e15] outline-none placeholder:text-[#6c6e79] focus:border-[#181e15]"
              />
              <Button variant="primary">Subscribe</Button>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
