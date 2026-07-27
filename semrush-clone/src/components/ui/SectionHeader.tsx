import { cn } from "@/lib/utils";

export function SectionHeader({
  label,
  heading,
  align = "left",
  invert = false,
  className,
  children,
}: {
  label?: string;
  heading: string;
  align?: "left" | "center";
  invert?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {label && (
        <span
          className={cn(
            "text-[12px] font-semibold uppercase tracking-[0.24px]",
            invert ? "text-[#89ff75]" : "text-[#6c6e79]",
          )}
        >
          {label}
        </span>
      )}
      <h2
        className={cn(
          "font-[family-name:var(--font-lazzer)] text-[36px] font-semibold uppercase leading-[1.05] tracking-[-1.2px] md:text-[56px] md:tracking-[-2.24px]",
          invert ? "text-white" : "text-[#181e15]",
        )}
      >
        {heading}
      </h2>
      {children}
    </div>
  );
}
