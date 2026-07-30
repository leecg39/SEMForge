"use client";

import { useEffect, useRef, useState } from "react";
import { toolkitSlides, toolkitsSection } from "@/data/pages/home";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";

const CARD_WIDTH = 430;
const CARD_GAP = 12;
const STEP = CARD_WIDTH + CARD_GAP;

const navButtonClass =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d1d2d5] text-[#181e15] transition-colors duration-200 ease-in-out hover:bg-black/5 disabled:pointer-events-none disabled:opacity-30";

export default function ToolkitsSlider() {
  const slides = useLocalizedValue(toolkitSlides);
  const section = useLocalizedValue(toolkitsSection);
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

  const maxIndex = Math.max(0, slides.length - visibleCount);
  const current = Math.min(index, maxIndex);

  return (
    <section className="py-[120px]">
      <div className="mp-container">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#181e15]">
              {section.label}
            </h2>
            <h3 className="mt-6 max-w-[980px] font-lazzer text-[36px] font-semibold uppercase leading-none tracking-[-0.04em] text-[#181e15] md:text-[64px] md:leading-[64px]">
              {section.heading}
            </h3>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              aria-label={tx("Previous slide")}
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
              aria-label={tx("Next slide")}
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
            className="flex transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${current * STEP}px)` }}
          >
            {slides.map((slide) => (
              <li
                key={slide.tag}
                className="mr-3 grid h-[500px] w-[430px] shrink-0 grid-rows-[auto_1fr] rounded-[5px] bg-[#dceeeb] bg-[url('/images/pattern-toolkit-card.svg')] bg-[position:right_bottom] bg-no-repeat p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#181e15]">
                      {slide.tag}
                    </h3>
                    <h4 className="mt-2 font-lazzer text-[24px] font-semibold leading-[28.8px] tracking-[-0.48px] text-[#181e15]">
                      {slide.title}
                    </h4>
                  </div>
                  <button
                    type="button"
                    aria-label={tx("Expand item").replace("{item}", slide.title)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#181e15] transition-colors duration-200 ease-in-out hover:bg-[#f3f6f6]"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M8 3.333v9.334M3.333 8h9.334"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex items-end">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.image}
                    alt={slide.alt}
                    loading="lazy"
                    className="w-full rounded-lg"
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
