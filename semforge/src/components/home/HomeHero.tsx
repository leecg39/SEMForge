"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { heroData } from "@/data/pages/home";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";

export default function HomeHero() {
  const router = useRouter();
  const data = useLocalizedValue(heroData);
  const tx = useSiteText();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/signup/");
  }

  return (
    <section className="bg-white pt-20 text-center">
      <div className="mx-auto max-w-[1440px] px-4 pb-20 md:px-10">
        <h1 className="mx-auto max-w-[980px] font-lazzer text-[40px] font-semibold leading-[1.08] tracking-[-1.2px] text-hof lg:text-[64px] lg:tracking-[-2px]">
          {data.title}
        </h1>
        <p className="mx-auto my-6 max-w-[600px] text-[16px] font-normal leading-[1.43] text-foggy">
          {data.subtitle}
        </p>

        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-[760px] flex-col gap-2 rounded-[14px] border border-bebe bg-white p-2 shadow-[var(--shadow-subtle)] md:h-[72px] md:flex-row md:items-center md:gap-0 md:rounded-full"
        >
          <input
            type="text"
            aria-label={data.inputPlaceholder}
            placeholder={data.inputPlaceholder}
            className="h-[52px] flex-1 border-0 bg-transparent pl-5 text-left text-[14px] text-hof outline-none placeholder:text-foggy md:h-[56px]"
          />
          <button
            type="button"
            aria-label={tx("Select country")}
            className="flex h-[48px] shrink-0 items-center justify-center gap-1.5 px-4 text-[14px] font-medium text-hof md:h-[56px]"
          >
            {data.country}
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 4.25 6 7.75l3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="submit"
            className="h-[52px] w-full shrink-0 rounded-full bg-rausch px-[28px] font-lazzer text-[14px] font-medium text-white transition-colors duration-200 ease-in-out hover:bg-rausch-600 md:w-auto"
          >
            {data.cta}
          </button>
        </form>

        <div className="mx-auto mt-16 max-w-[1114px] overflow-hidden rounded-[14px] bg-faint">
          {data.demoVideo ? (
            <video
              src={data.demoVideo}
              poster={data.demoPoster}
              autoPlay
              loop
              muted
              playsInline
              className="block h-auto w-full"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.demoPoster}
              alt={tx("Product preview")}
              className="block h-auto w-full"
            />
          )}
        </div>
      </div>
    </section>
  );
}
