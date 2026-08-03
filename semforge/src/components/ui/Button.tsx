import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "accent" | "outline" | "dark" | "light";

const variants: Record<Variant, string> = {
  primary: "bg-hof text-white hover:bg-black",
  dark: "bg-hof text-white hover:bg-black",
  accent: "bg-rausch text-white hover:bg-rausch-600",
  outline: "border border-hof text-hof hover:bg-faint",
  light: "bg-white text-hof hover:bg-faint",
};

interface Props {
  href?: string;
  variant?: Variant;
  size?: "md" | "lg";
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Button({
  href,
  variant = "primary",
  size = "md",
  external,
  className,
  children,
}: Props) {
  const cls = cn(
    "inline-flex items-center justify-center rounded-[8px] font-[family-name:var(--font-lazzer)] font-medium transition-colors duration-200 ease-in-out",
    size === "lg" ? "h-[52px] px-[28px] text-[16px]" : "h-[44px] px-5 text-[14px]",
    variants[variant],
    className,
  );
  if (!href) return <button className={cls}>{children}</button>;
  if (external || href.startsWith("http")) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
