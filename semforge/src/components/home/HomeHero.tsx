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
    <section
      className="pt-16 text-center"
      style={{
        backgroundImage:
          "url(/images/pattern-hero.svg), linear-gradient(180deg, #dceeeb 0%, #e8e1ff 75%, #fff 100%)",
        backgroundRepeat: "repeat-x, no-repeat",
        backgroundPosition: "left bottom, center",
      }}
    >
      <div className="mx-auto max-w-[1440px] px-4 pb-16 md:px-8">
        <h1 className="mx-auto max-w-[1050px] font-lazzer text-[44px] font-semibold leading-[48px] tracking-[-1.8px] text-mp-off-black lg:text-[84px] lg:leading-[92.4px] lg:tracking-[-3.36px]">
          {data.title}
        </h1>
        <p className="mx-auto my-6 max-w-[540px] text-[18px] font-medium leading-[27px]">
          {data.subtitle}
        </p>

        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-[600px] flex-col gap-2 rounded-[24px] bg-mp-white p-2 shadow-glass md:h-[76px] md:flex-row md:items-center md:gap-0 md:rounded-[100px]"
        >
          <input
            type="text"
            aria-label={data.inputPlaceholder}
            placeholder={data.inputPlaceholder}
            className="h-[56px] flex-1 border-0 bg-transparent pl-6 text-left text-[16px] text-mp-off-black outline-none placeholder:text-mp-dark-grey md:h-[60px]"
          />
          <button
            type="button"
            aria-label={tx("Select country")}
            className="flex h-[56px] shrink-0 items-center justify-center gap-1.5 px-4 text-[14px] font-semibold text-mp-off-black md:h-[60px]"
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
            className="h-[60px] w-full shrink-0 rounded-[100px] bg-mp-lavendar px-[30px] font-lazzer text-[16px] font-semibold text-mp-off-black transition-colors duration-200 ease-in-out hover:bg-mp-lavendar-hover md:w-auto"
          >
            {data.cta}
          </button>
        </form>

        <div className="mx-auto mt-16 max-w-[1114px] overflow-hidden rounded-[16px] shadow-[0_24px_80px_rgba(0,0,0,0.12)]">
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
