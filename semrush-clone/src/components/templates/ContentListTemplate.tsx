"use client";

import Link from "next/link";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/utils";
import type { ContentListData, HubCard } from "@/types/templates";

const variantLabels: Record<NonNullable<ContentListData["variant"]>, string> = {
  blog: "Blog",
  kb: "Knowledge Base",
  academy: "Academy",
  news: "News",
  stories: "Success Stories",
  webinars: "Webinars",
};

function PostCard({
  post,
  variant,
}: {
  post: HubCard;
  variant?: ContentListData["variant"];
}) {
  const tx = useSiteText();
  return (
    <Link
      href={post.href}
      className="group flex flex-col overflow-hidden rounded-[16px] border border-[#f0f1f2] bg-white transition-shadow duration-200 ease-in-out hover:shadow-[0_8px_24px_rgba(24,30,21,0.08)]"
    >
      {post.image && (
        <img
          src={post.image}
          alt={post.title}
          className="h-[180px] w-full bg-[#f3f6f6] object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-2 p-6">
        {variant === "academy" && (
          <span className="inline-flex w-fit items-center rounded-full bg-[#dceeeb] px-3 py-1 text-[12px] font-semibold text-[#181e15]">
            {tx("Course")}
          </span>
        )}
        {post.tag && (
          <span className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
            {post.tag}
          </span>
        )}
        <h3 className="font-[family-name:var(--font-lazzer)] text-[18px] font-semibold leading-[1.25] text-[#181e15]">
          {post.title}
        </h3>
        {post.body && (
          <p className="text-[14px] leading-[1.5] text-[#6c6e79]">{post.body}</p>
        )}
        {variant === "academy" && (
          <div className="mt-auto pt-4">
            <div className="h-[6px] w-full overflow-hidden rounded-full bg-[#f0f1f2]">
              <div className="h-full w-[35%] rounded-full bg-[#c190ff]" />
            </div>
          </div>
        )}
        {variant === "webinars" && (
          <div className="mt-auto flex items-center gap-2 pt-4 text-[13px] text-[#6c6e79]">
            <span aria-hidden className="h-6 w-6 shrink-0 rounded-full bg-[#dceeeb]" />
            <span>{tx("Speaker · Date to be announced")}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function ContentListTemplate({ data: sourceData }: { data: ContentListData }) {
  const data = useLocalizedValue(sourceData);
  const tx = useSiteText();
  const label = data.variant ? tx(variantLabels[data.variant]) : undefined;

  return (
    <main>
      {/* Hero */}
      <section className="bg-[#f7fbfa] py-[64px]">
        <Container className="flex flex-col gap-4">
          {label && (
            <span className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
              {label}
            </span>
          )}
          <h1 className="font-[family-name:var(--font-lazzer)] text-[36px] font-semibold leading-[1.05] tracking-[-1.2px] text-[#181e15] md:text-[48px] md:tracking-[-1.8px]">
            {data.title}
          </h1>
          {data.subtitle && (
            <p className="max-w-[640px] text-[18px] leading-[1.5] text-[#6c6e79]">
              {data.subtitle}
            </p>
          )}
        </Container>
      </section>

      {/* Categories (static, first active) */}
      {data.categories && data.categories.length > 0 && (
        <section className="pt-[40px]">
          <Container>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {data.categories.map((category, i) => (
                <span
                  key={category}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full px-5 py-2.5 text-[14px] font-semibold",
                    i === 0
                      ? "bg-[#181e15] text-white"
                      : "border border-[#d1d2d5] text-[#181e15]",
                  )}
                >
                  {category}
                </span>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Featured */}
      {data.featured && (
        <section className="pt-[40px]">
          <Container>
            <Link
              href={data.featured.href}
              className="group grid overflow-hidden rounded-[16px] border border-[#f0f1f2] bg-white transition-shadow duration-200 ease-in-out hover:shadow-[0_8px_24px_rgba(24,30,21,0.08)] md:grid-cols-2"
            >
              {data.featured.image ? (
                <img
                  src={data.featured.image}
                  alt={data.featured.title}
                  className="h-[240px] w-full bg-[#f3f6f6] object-cover md:h-full"
                />
              ) : (
                <div className="h-[240px] w-full bg-[#dceeeb] md:h-full" />
              )}
              <div className="flex flex-col justify-center gap-4 p-8 md:p-12">
                {data.featured.tag && (
                  <span className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
                    {data.featured.tag}
                  </span>
                )}
                <h2 className="font-[family-name:var(--font-lazzer)] text-[26px] font-semibold leading-[1.1] tracking-[-0.5px] text-[#181e15] md:text-[32px]">
                  {data.featured.title}
                </h2>
                {data.featured.body && (
                  <p className="text-[16px] leading-[1.6] text-[#6c6e79]">
                    {data.featured.body}
                  </p>
                )}
                <span className="font-[family-name:var(--font-lazzer)] text-[16px] font-semibold text-[#181e15] group-hover:underline">
                  {tx("Read more")} →
                </span>
              </div>
            </Link>
          </Container>
        </section>
      )}

      {/* Posts grid */}
      <section className="pb-[64px] pt-[40px] md:pb-[80px]">
        <Container>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {data.posts.map((post) => (
              <PostCard
                key={`${post.href}-${post.title}`}
                post={post}
                variant={data.variant}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* Newsletter band */}
      <section className="pb-[64px] md:pb-[120px]">
        <Container>
          <div className="flex flex-col items-center gap-8 rounded-[24px] bg-[#dceeeb] px-8 py-[64px] text-center">
            <SectionHeader heading={tx("Stay in the loop")} align="center" />
            <form className="flex w-full max-w-[520px] flex-col gap-3 sm:flex-row">
              <input
                type="email"
                placeholder={tx("Enter your email")}
                aria-label={tx("Email address")}
                className="h-[56px] flex-1 rounded-full bg-white px-6 text-[16px] text-[#181e15] outline-none placeholder:text-[#6c6e79]"
              />
              <Button variant="primary" className="h-[56px] px-8">
                {tx("Subscribe")}
              </Button>
            </form>
          </div>
        </Container>
      </section>
    </main>
  );
}
