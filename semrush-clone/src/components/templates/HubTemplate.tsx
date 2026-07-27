"use client";

import { useState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { HubCard, HubPageData } from "@/types/templates";

function HubCardItem({ card }: { card: HubCard }) {
  return (
    <Link
      href={card.href}
      className="group flex flex-col overflow-hidden rounded-[16px] border border-[#f0f1f2] bg-white transition-shadow duration-200 ease-in-out hover:shadow-[0_8px_24px_rgba(24,30,21,0.08)]"
    >
      {card.image && (
        <img
          src={card.image}
          alt={card.title}
          className="h-[180px] w-full bg-[#f3f6f6] object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-2 p-6">
        {card.tag && (
          <span className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
            {card.tag}
          </span>
        )}
        <h3 className="font-[family-name:var(--font-lazzer)] text-[20px] font-semibold leading-[1.2] text-[#181e15]">
          {card.title}
        </h3>
        {card.body && (
          <p className="text-[15px] leading-[1.5] text-[#6c6e79]">{card.body}</p>
        )}
      </div>
    </Link>
  );
}

export function HubTemplate({ data }: { data: HubPageData }) {
  const [activeTab, setActiveTab] = useState(data.tabs?.[0] ?? "All");
  const showAll = activeTab.toLowerCase() === "all";
  const visibleCards = showAll
    ? data.cards
    : data.cards.filter((card) => !card.tag || card.tag === activeTab);

  return (
    <main>
      {/* Hero */}
      <section className="bg-[#f7fbfa] py-[64px] md:py-[80px]">
        <Container className="flex flex-col items-center gap-4 text-center">
          {data.eyebrow && (
            <span className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
              {data.eyebrow}
            </span>
          )}
          <h1 className="font-[family-name:var(--font-lazzer)] text-[40px] font-semibold leading-[1.05] tracking-[-1.5px] text-[#181e15] md:text-[56px] md:tracking-[-2px]">
            {data.title}
          </h1>
          <p className="max-w-[640px] text-[18px] leading-[1.5] text-[#6c6e79]">
            {data.subtitle}
          </p>
        </Container>
      </section>

      {/* Tabs + cards grid */}
      <section className="pb-[64px] pt-[48px] md:pb-[120px] md:pt-[64px]">
        <Container>
          {data.tabs && data.tabs.length > 0 && (
            <div className="mb-10 flex flex-wrap justify-center gap-2 md:mb-12">
              {data.tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "h-[44px] shrink-0 rounded-full px-5 text-[14px] font-semibold transition-colors duration-200 ease-in-out",
                    activeTab === tab
                      ? "bg-[#181e15] text-white"
                      : "border border-[#d1d2d5] text-[#181e15] hover:border-[#181e15]",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
          {visibleCards.length === 0 ? (
            <p className="py-12 text-center text-[15px] text-[#6c6e79]">
              No items found for this category.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {visibleCards.map((card) => (
                <HubCardItem key={`${card.href}-${card.title}`} card={card} />
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* Bottom CTA band */}
      {data.primaryCta && (
        <section className="pb-[64px] md:pb-[120px]">
          <Container>
            <div className="flex justify-center rounded-[24px] bg-[#dceeeb] px-8 py-[64px] text-center">
              <Button
                href={data.primaryCta.href}
                variant={data.primaryCta.variant ?? "accent"}
                size="lg"
              >
                {data.primaryCta.label}
              </Button>
            </div>
          </Container>
        </section>
      )}
    </main>
  );
}
