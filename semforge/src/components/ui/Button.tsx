import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "accent" | "outline" | "dark" | "light";

const variants: Record<Variant, string> = {
  // 마케팅 pill 버튼 스타일
  primary: "bg-[#181e15] text-white hover:bg-[#2a2f27]",
  dark: "bg-[#181e15] text-white hover:bg-[#2a2f27]",
  accent: "bg-[#c190ff] text-[#181e15] hover:bg-[#b072ff]",
  outline: "border border-[#181e15] text-[#181e15] hover:bg-black/5",
  light: "bg-white text-[#181e15] hover:bg-white/90",
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
    "inline-flex items-center justify-center rounded-full font-[family-name:var(--font-lazzer)] font-semibold transition-colors duration-200 ease-in-out",
    size === "lg" ? "h-[60px] px-[30px] text-[16px]" : "h-[48px] px-6 text-[15px]",
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
