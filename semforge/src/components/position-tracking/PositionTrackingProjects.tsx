"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { CampaignListItem } from "@/server/position-tracking/overview";

const COPY = {
  ko: {
    title: "포지션 추적",
    searchPlaceholder: "프로젝트 이름 또는 도메인",
    create: "+ 프로젝트 만들기",
    createTitle: "새 포지션 추적 프로젝트",
    domainLabel: "도메인",
    domainPlaceholder: "예: example.com",
    submit: "프로젝트 만들기",
    submitting: "만드는 중…",
    cancel: "취소",
    createError: "프로젝트를 만들지 못했습니다.",
    invalidDomain: "올바른 도메인을 입력해 주세요.",
    duplicateDomain: "이미 같은 도메인의 프로젝트가 있습니다.",
    project: "프로젝트",
    target: "기기 및 위치",
    visibility: "가시성",
    diff: "차이",
    improved: "개선된 키워드",
    declined: "하락한 키워드",
    keywords: "모든 키워드",
    updated: "업데이트",
    setup: "설정",
    never: "수집 전",
    empty: "검색 결과가 없습니다.",
    justNow: "방금 전",
    minutesAgo: (minutes: number) => `${minutes}분 전`,
    hoursAgo: (hours: number) => `${hours}시간 전`,
    daysAgo: (days: number) => `${days}일 전`,
  },
  en: {
    title: "Position Tracking",
    searchPlaceholder: "Project name or domain",
    create: "+ Create project",
    createTitle: "New position tracking project",
    domainLabel: "Domain",
    domainPlaceholder: "e.g. example.com",
    submit: "Create project",
    submitting: "Creating…",
    cancel: "Cancel",
    createError: "The project could not be created.",
    invalidDomain: "Enter a valid domain.",
    duplicateDomain: "A project for this domain already exists.",
    project: "Project",
    target: "Device & location",
    visibility: "Visibility",
    diff: "Diff",
    improved: "Improved keywords",
    declined: "Declined keywords",
    keywords: "All keywords",
    updated: "Updated",
    setup: "Set up",
    never: "Not collected",
    empty: "No projects match your search.",
    justNow: "just now",
    minutesAgo: (minutes: number) => `${minutes}m ago`,
    hoursAgo: (hours: number) => `${hours}h ago`,
    daysAgo: (days: number) => `${days}d ago`,
  },
} as const;

const ENGINE_LABELS: Record<string, string> = {
  google: "Google",
  bing: "Bing",
  chatgpt: "ChatGPT",
};

function normalizeDomainInput(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/\.$/, "");
}

function relativeTime(iso: string | null, copy: (typeof COPY)[keyof typeof COPY]) {
  if (!iso) return copy.never;
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return copy.justNow;
  if (minutes < 60) return copy.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return copy.hoursAgo(hours);
  return copy.daysAgo(Math.floor(hours / 24));
}

function DiffCell({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null || value === 0) {
    return <span className="text-app-text-secondary">0</span>;
  }
  const positive = value > 0;
  return (
    <span className={cn("font-semibold", positive ? "text-[#0a6b57]" : "text-[#a4002a]")}>
      {positive ? "▲" : "▼"} {Math.abs(value)}
      {suffix}
    </span>
  );
}

/**
 * 랜딩 프로젝트 목록 (원본 /position-tracking 목록 화면).
 * 지표는 전부 수집 이력(visibility_history)과 추적 키워드의 실측값이다.
 */
export function PositionTrackingProjects({
  items,
  canCreate,
}: {
  items: CampaignListItem[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.domain.toLowerCase().includes(term)
    );
  }, [items, query]);

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeDomainInput(domain);
    if (!normalized || !normalized.includes(".") || /\s/.test(normalized)) {
      setError(copy.invalidDomain);
      return;
    }
    if (items.some((item) => normalizeDomainInput(item.domain) === normalized)) {
      setError(copy.duplicateDomain);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post<{ id: string }>("/api/position-tracking/", {
        name: `${normalized} ${locale === "ko" ? "포지션 추적" : "Position Tracking"}`,
        domain: normalized,
        location: "Seoul, South Korea",
        device: "desktop",
        searchEngine: "google",
      });
      router.push(`/position-tracking/?campaign=${encodeURIComponent(response.data.id)}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : copy.createError);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-[#f5f6fa] p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-semibold leading-[32px] text-app-text">
          {copy.title}
        </h1>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setCreating((open) => !open);
              setError(null);
            }}
            className="h-[38px] rounded-[8px] bg-[#171b18] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#303633]"
          >
            {copy.create}
          </button>
        )}
      </header>

      {creating && canCreate && (
        <section className="mt-4 rounded-[10px] border border-app-border bg-white p-4">
          <h2 className="text-[14px] font-semibold text-app-text">{copy.createTitle}</h2>
          <form onSubmit={createProject} className="mt-3 flex flex-wrap items-end gap-3" noValidate>
            <label className="min-w-[260px] flex-1">
              <span className="mb-1.5 block text-[12px] font-medium text-app-text-secondary">
                {copy.domainLabel}
              </span>
              <input
                value={domain}
                onChange={(event) => {
                  setDomain(event.target.value);
                  if (error) setError(null);
                }}
                placeholder={copy.domainPlaceholder}
                aria-invalid={Boolean(error)}
                className="h-[38px] w-full rounded-[8px] border border-app-border bg-white px-3 text-[13px] text-app-text outline-none focus:border-app-blue"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="h-[38px] rounded-[8px] bg-app-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-app-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? copy.submitting : copy.submit}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="h-[38px] rounded-[8px] border border-app-border px-4 text-[13px] text-app-text transition-colors hover:bg-[#f3f4f7]"
            >
              {copy.cancel}
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-[12px] text-app-red">
              {error}
            </p>
          )}
        </section>
      )}

      <section className="mt-4 rounded-[10px] border border-app-border bg-white">
        <div className="border-b border-app-border p-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
            className="h-[36px] w-full max-w-[320px] rounded-[8px] border border-app-border bg-white px-3 text-[13px] text-app-text outline-none placeholder:text-[#9a9ca4] focus:border-app-blue"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="border-b border-app-border bg-[#f9fafb] text-[12px] text-app-text-secondary">
                <th className="px-4 py-2.5 font-medium">{copy.project}</th>
                <th className="px-4 py-2.5 font-medium">{copy.target}</th>
                <th className="px-4 py-2.5 text-right font-medium">{copy.visibility}</th>
                <th className="px-4 py-2.5 text-right font-medium">{copy.diff}</th>
                <th className="px-4 py-2.5 text-right font-medium">{copy.improved}</th>
                <th className="px-4 py-2.5 text-right font-medium">{copy.declined}</th>
                <th className="px-4 py-2.5 text-right font-medium">{copy.keywords}</th>
                <th className="px-4 py-2.5 text-right font-medium">{copy.updated}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-app-text-secondary">
                    {copy.empty}
                  </td>
                </tr>
              )}
              {filtered.map((item) => {
                const href = `/position-tracking/?campaign=${encodeURIComponent(item.id)}`;
                return (
                  <tr key={item.id} className="border-b border-app-border text-[13px] last:border-b-0">
                    <td className="px-4 py-3">
                      <Link href={href} className="font-semibold text-app-blue hover:underline">
                        {item.name}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-app-text-secondary">{item.domain}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-app-text">{item.location}</p>
                      <p className="mt-0.5 text-[12px] capitalize text-app-text-secondary">
                        {ENGINE_LABELS[item.searchEngine] ?? item.searchEngine} · {item.device}
                      </p>
                    </td>
                    {item.configured ? (
                      <>
                        <td className="px-4 py-3 text-right font-semibold text-app-text">
                          {item.visibility !== null ? `${item.visibility}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DiffCell value={item.visibilityDiff} suffix="%p" />
                        </td>
                        <td className="px-4 py-3 text-right text-[#0a6b57]">{item.improved}</td>
                        <td className="px-4 py-3 text-right text-[#a4002a]">{item.declined}</td>
                        <td className="px-4 py-3 text-right text-app-text">{item.keywordCount}</td>
                        <td className="px-4 py-3 text-right text-app-text-secondary">
                          {relativeTime(item.lastCollectedAt, copy)}
                        </td>
                      </>
                    ) : (
                      <td colSpan={6} className="px-4 py-3">
                        <Link
                          href={href}
                          className="inline-flex h-[30px] items-center rounded-[6px] border border-app-border px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-[#f3f4f7]"
                        >
                          {copy.setup}
                        </Link>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
