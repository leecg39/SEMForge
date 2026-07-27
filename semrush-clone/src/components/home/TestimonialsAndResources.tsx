"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { resourcesSection, testimonialSection } from "@/data/pages/home";

const CARD_WIDTH = 430;
const CARD_GAP = 12;
const STEP = CARD_WIDTH + CARD_GAP;

const navButtonClass =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d1d2d5] text-[#181e15] transition-colors duration-200 ease-in-out hover:bg-black/5 disabled:pointer-events-none disabled:opacity-30";

const resourceTitleClass =
  "font-lazzer text-[20px] font-semibold leading-[26px] text-[#181e15] transition-colors duration-200 ease-in-out hover:underline";

function SectionHeader({ label, heading }: { label: string; heading: string }) {
  return (
    <div>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#181e15]">
        {label}
      </h2>
      <h3 className="mt-6 max-w-[980px] font-lazzer text-[36px] font-semibold uppercase leading-none tracking-[-0.04em] text-[#181e15] md:text-[64px] md:leading-[64px]">
        {heading}
      </h3>
    </div>
  );
}

export default function TestimonialsAndResources() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () =>
      setVisibleCount(
        Math.max(1, Math.floor((viewport.clientWidth + CARD_GAP) / STEP)),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const maxIndex = Math.max(0, resourcesSection.cards.length - visibleCount);
  const current = Math.min(index, maxIndex);

  return (
    <>
      <section className="pb-8 pt-[120px]">
        <div className="mp-container">
          <SectionHeader
            label={testimonialSection.label}
            heading={testimonialSection.heading}
          />
          <div className="mt-[60px] grid grid-cols-1 gap-4 lg:grid-cols-2">
            <figure className="flex flex-col rounded-3xl bg-[#f3f6f6] p-8 md:p-12">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={testimonialSection.logo}
                alt="ZoomInfo"
                className="h-7 w-auto self-start"
              />
              <blockquote className="mt-8 flex-1 font-lazzer text-[24px] font-medium leading-[33.6px] text-[#181e15]">
                {testimonialSection.quote}
              </blockquote>
              <figcaption className="mt-10 flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={testimonialSection.avatar}
                  alt={testimonialSection.author}
                  className="h-12 w-12 rounded-full object-cover"
                />
                <div>
                  <p className="text-[16px] font-semibold text-[#181e15]">
                    {testimonialSection.author}
                  </p>
                  <p className="text-[14px] text-[#6c6e79]">
                    {testimonialSection.role}
                  </p>
                </div>
              </figcaption>
            </figure>
            <div className="flex flex-col items-center justify-center rounded-3xl bg-[#dceeeb] bg-[url('/images/pattern-testimonials-card.svg')] bg-[position:right_bottom] bg-no-repeat p-8 text-center md:p-12">
              <p className="font-lazzer text-[96px] font-semibold leading-none tracking-[-0.04em] text-[#181e15]">
                {testimonialSection.stat.value}
              </p>
              <p className="mt-4 text-[16px] text-[#181e15]">
                {testimonialSection.stat.note}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-[120px]">
        <div className="mp-container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeader
              label={resourcesSection.label}
              heading={resourcesSection.heading}
            />
            <div className="flex gap-3">
              <button
                type="button"
                aria-label="Previous resources"
                disabled={current === 0}
                onClick={() => setIndex(Math.max(0, current - 1))}
                className={navButtonClass}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M12.5 4.167 6.667 10l5.833 5.833"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Next resources"
                disabled={current === maxIndex}
                onClick={() => setIndex(Math.min(maxIndex, current + 1))}
                className={navButtonClass}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M7.5 4.167 13.333 10 7.5 15.833"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div ref={viewportRef} className="mt-[60px] overflow-hidden">
            <ul
              className="flex items-stretch transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${current * STEP}px)` }}
            >
              {resourcesSection.cards.map((card) => {
                const isExternal = card.href.startsWith("http");
                return (
                  <li
                    key={card.title}
                    className="mr-3 flex w-[430px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#f0f1f2]"
                  >
                    <div className="h-[240px] bg-[#f3f6f6]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={card.image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      {isExternal ? (
                        <a
                          href={card.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={resourceTitleClass}
                        >
                          {card.title}
                        </a>
                      ) : (
                        <Link href={card.href} className={resourceTitleClass}>
                          {card.title}
                        </Link>
                      )}
                      <p className="mt-3 line-clamp-3 text-[14px] leading-[21px] text-[#6c6e79]">
                        {card.body}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-2 pt-6">
                        {card.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-[100px] border border-[#d1d2d5] px-3 py-1 text-[12px] text-[#181e15]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
