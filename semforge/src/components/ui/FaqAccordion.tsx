"use client";

import * as Accordion from "@radix-ui/react-accordion";
import type { FaqItem } from "@/types/templates";

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <Accordion.Root type="single" collapsible className="w-full divide-y divide-[#f0f1f2]">
      {items.map((item, i) => (
        <Accordion.Item key={i} value={`item-${i}`}>
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 py-6 text-left font-[family-name:var(--font-lazzer)] text-[18px] font-semibold text-[#181e15]">
              {item.q}
              <span className="shrink-0 text-2xl transition-transform duration-200 group-data-[state=open]:rotate-45">
                +
              </span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden pb-6 text-[16px] leading-[1.6] text-[#6c6e79] data-[state=closed]:animate-none">
            {item.a}
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
