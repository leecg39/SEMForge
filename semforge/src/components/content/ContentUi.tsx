import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ContentPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-rausch">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-hof">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[14px] leading-6 text-foggy">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = {
    active: "진행 중",
    awaiting_approval: "승인 대기",
    completed: "완료",
    failed: "실패",
    archived: "보관",
    queued: "대기",
    running: "실행 중",
    ready: "준비됨",
    cancelled: "취소",
    draft: "초안",
    in_review: "검토 중",
    published: "게시됨",
    planning: "콘티 작성",
    awaiting_storyboard_approval: "콘티 승인 대기",
    generating_keyframes: "키프레임 제작",
    awaiting_keyframe_approval: "키프레임 승인 대기",
    generating: "제작 중",
    assembling: "조립 중",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
        ["completed", "published", "ready"].includes(status) && "bg-emerald-50 text-emerald-700",
        ["failed"].includes(status) && "bg-red-50 text-red-700",
        ["running", "active", "planning", "generating_keyframes", "generating", "assembling"].includes(status) && "bg-blue-50 text-blue-700",
        ["queued", "draft", "in_review", "archived", "cancelled", "awaiting_approval", "awaiting_storyboard_approval", "awaiting_keyframe_approval"].includes(status) && "bg-faint text-foggy",
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-10 items-center justify-center rounded-full bg-rausch px-5 text-[13px] font-semibold text-white transition hover:bg-rausch-600">
      {children}
    </Link>
  );
}

export const fieldClass = "h-11 w-full rounded-[10px] border border-deco bg-white px-3.5 text-[14px] text-hof outline-none transition placeholder:text-grey-500 focus:border-rausch focus:ring-2 focus:ring-rausch/15";
export const textareaClass = "w-full rounded-[12px] border border-deco bg-white px-4 py-3 text-[14px] leading-6 text-hof outline-none transition placeholder:text-grey-500 focus:border-rausch focus:ring-2 focus:ring-rausch/15";
