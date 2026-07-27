import Link from "next/link";
import { statsSection } from "@/data/pages/home";

function ArrowUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 20V4m0 0-7 7m7-7 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const rowGridClass =
  "grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.5fr)_minmax(0,1fr)] md:items-end md:gap-8";

export default function StatsSection() {
  const [first, ...rest] = statsSection.stats;

  return (
    <section className="py-[120px]">
      <div className="mp-container">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#181e15]">
          {statsSection.label}
        </h2>
        <h3 className="mt-6 max-w-[980px] font-lazzer text-[36px] font-semibold uppercase leading-none tracking-[-0.04em] text-[#181e15] md:text-[64px] md:leading-[64px]">
          {statsSection.heading}
        </h3>

        <div className="mt-[60px]">
          <div
            className={`${rowGridClass} rounded-2xl bg-[#181e15] px-6 py-8 text-white md:px-10`}
          >
            <p className="flex items-start font-lazzer text-[72px] font-medium leading-none tracking-[-0.06em] md:text-[180px] md:leading-[162px]">
              <ArrowUp className="mt-[0.1em] h-[0.36em] w-[0.36em] shrink-0" />
              <span>{first.value}</span>
            </p>
            <p className="text-[24px] font-semibold text-white">{first.unit}</p>
            <p className="text-[16px] leading-6 text-[#d1d2d5]">{first.note}</p>
          </div>

          {rest.map((stat) => (
            <div
              key={stat.unit}
              className={`${rowGridClass} group mt-4 border-t border-[#d1d2d5] px-6 pt-6 pb-2 md:px-10`}
            >
              <p className="flex items-start font-lazzer text-[56px] font-medium leading-none tracking-[-0.06em] text-[#d1d2d5] transition-colors duration-200 ease-in-out group-hover:text-[#181e15] md:text-[100px]">
                <ArrowUp className="mt-[0.1em] h-[0.36em] w-[0.36em] shrink-0" />
                <span>{stat.value}</span>
              </p>
              <p className="text-[24px] font-semibold text-[#181e15]">{stat.unit}</p>
              <p className="text-[16px] leading-6 text-[#6c6e79]">{stat.note}</p>
            </div>
          ))}
        </div>

        <Link
          href={statsSection.cta.href}
          className="mt-[60px] inline-flex items-center justify-center rounded-[100px] border border-[#181e15] px-[30px] py-4 text-[16px] font-semibold text-[#181e15] transition-colors duration-200 ease-in-out hover:bg-[#181e15] hover:text-white"
        >
          {statsSection.cta.label}
        </Link>
      </div>
    </section>
  );
}
