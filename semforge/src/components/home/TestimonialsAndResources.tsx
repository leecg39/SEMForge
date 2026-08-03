"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { resourcesSection, testimonialSection } from "@/data/pages/home";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";

const CARD_WIDTH = 430;
const CARD_GAP = 12;
const STEP = CARD_WIDTH + CARD_GAP;

const navButtonClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-faint text-hof transition-colors duration-200 ease-in-out hover:bg-bebe disabled:pointer-events-none disabled:text-grey-500 disabled:opacity-60";

const resourceTitleClass =
  "font-lazzer text-[20px] font-semibold leading-[26px] text-hof transition-colors duration-200 ease-in-out hover:underline";

function SectionHeader({ label, heading }: { label: string; heading: string }) {
  return (
    <div>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.24px] text-foggy">
        {label}
      </h2>
      <h3 className="mt-3 max-w-[980px] font-lazzer text-[28px] font-semibold leading-[1.2] tracking-[-0.56px] text-hof md:text-[36px]">
        {heading}
      </h3>
    </div>
  );
}

export default function TestimonialsAndResources() {
  const resources = useLocalizedValue(resourcesSection);
  const testimonial = useLocalizedValue(testimonialSection);
  const tx = useSiteText();
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

  const maxIndex = Math.max(0, resources.cards.length - visibleCount);
  const current = Math.min(index, maxIndex);

  return (
    <>
      <section className="bg-white pb-8 pt-[96px]">
        <div className="mp-container">
          <SectionHeader
            label={testimonial.label}
            heading={testimonial.heading}
          />
          <div className="mt-[60px] grid grid-cols-1 gap-4 lg:grid-cols-2">
            <figure className="flex flex-col rounded-[14px] bg-faint p-8 md:p-12">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={testimonial.logo}
                alt="ZoomInfo"
                className="h-7 w-auto self-start"
              />
              <blockquote className="mt-8 flex-1 font-lazzer text-[22px] font-medium leading-[1.35] tracking-[-0.44px] text-hof">
                {testimonial.quote}
              </blockquote>
              <figcaption className="mt-10 flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={testimonial.avatar}
                  alt={testimonial.author}
                  className="h-12 w-12 rounded-full object-cover"
                />
                <div>
                  <p className="text-[16px] font-semibold text-hof">
                    {testimonial.author}
                  </p>
                  <p className="text-[14px] text-foggy">
                    {testimonial.role}
                  </p>
                </div>
              </figcaption>
            </figure>
            <div className="flex flex-col items-center justify-center rounded-[14px] bg-faint p-8 text-center md:p-12">
              <p className="font-lazzer text-[96px] font-semibold leading-none tracking-[-0.04em] text-hof">
                {testimonial.stat.value}
              </p>
              <p className="mt-4 text-[16px] text-foggy">
                {testimonial.stat.note}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-[96px]">
        <div className="mp-container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeader
              label={resources.label}
              heading={resources.heading}
            />
            <div className="flex gap-3">
              <button
                type="button"
                aria-label={tx("Previous resources")}
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
                aria-label={tx("Next resources")}
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
              {resources.cards.map((card) => {
                const isExternal = card.href.startsWith("http");
                return (
                  <li
                    key={card.title}
                    className="mr-3 flex w-[430px] shrink-0 flex-col overflow-hidden rounded-[12px] bg-white"
                  >
                    <div className="h-[240px] bg-faint">
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
                      <p className="mt-3 line-clamp-3 text-[14px] leading-[21px] text-foggy">
                        {card.body}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-2 pt-6">
                        {card.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-bebe px-3 py-1 text-[12px] text-hof"
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
