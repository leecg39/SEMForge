import Link from "next/link";
import { promoBlocks } from "@/data/pages/home";
import { cn } from "@/lib/utils";

export default function PromoBlocks() {
  return (
    <section className="mp-container">
      <div className="flex flex-col gap-[12px]">
        {promoBlocks.map((block) => {
          const isImageBg = block.bg.startsWith("image:");
          const label = block.id.replace(/-/g, " ").toUpperCase();

          return (
            <article
              key={block.id}
              className={cn(
                "grid grid-cols-1 overflow-hidden rounded-[24px] p-8 lg:grid-cols-[40%_60%] lg:p-[56px]",
                block.id === "enterprise" ? "lg:h-[620px]" : "lg:h-[569px]",
                isImageBg ? "text-mp-white" : "text-mp-off-black",
              )}
              style={
                isImageBg
                  ? {
                      backgroundImage: `url(${block.bg.slice("image:".length)})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : { backgroundColor: block.bg }
              }
            >
              <div className="flex flex-col items-start justify-center lg:pr-12">
                <p className="text-[12px] font-semibold uppercase tracking-[0.24px]">
                  {label}
                </p>
                <h2 className="mt-4 font-lazzer text-[32px] font-semibold leading-[38px] tracking-[-0.8px] lg:text-[40px] lg:leading-[48px]">
                  {block.heading}
                </h2>
                <p className="mt-4 text-[16px] leading-[24px]">{block.body}</p>
                <Link
                  href={block.href}
                  className={cn(
                    "mt-8 inline-flex items-center rounded-[100px] px-[30px] py-4 font-lazzer text-[16px] font-semibold transition-colors duration-200 ease-in-out",
                    isImageBg
                      ? "bg-mp-white text-mp-off-black hover:bg-white/90"
                      : block.id === "semrush-mcp"
                        ? "border border-mp-off-black bg-transparent text-mp-off-black hover:bg-mp-off-black/5"
                        : "bg-mp-off-black text-mp-white hover:bg-mp-off-black/90",
                  )}
                >
                  {block.cta}
                </Link>
              </div>
              <div className="mt-8 min-h-0 lg:mt-0 lg:h-full">
                <img
                  src={block.media}
                  alt=""
                  loading="lazy"
                  className="h-full w-full rounded-[16px] object-cover"
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
