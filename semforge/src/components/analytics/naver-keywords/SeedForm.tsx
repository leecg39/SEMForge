// @TASK NAVER-P0-EXPLORER - 1~5개 seed 키워드 입력 UI
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/analytics/naver-keywords/model.test.ts
"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_SEEDS, normalizeSeeds } from "@/components/analytics/naver-keywords/model";

interface SeedFormProps {
  seeds: readonly string[];
  loading: boolean;
  onSeedsChange: (seeds: string[]) => void;
  onSubmit: (seeds: string[]) => void;
}

export function SeedForm({ seeds, loading, onSeedsChange, onSubmit }: SeedFormProps) {
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const addDraft = () => {
    const values = draft.split(/[\n,]/u);
    try {
      const next = normalizeSeeds([...seeds, ...values]);
      onSeedsChange(next);
      setDraft("");
      setFieldError(null);
      return next;
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "키워드를 확인해 주세요.");
      return null;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    if (draft.trim()) addDraft();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let next = [...seeds];
    if (draft.trim()) {
      const added = addDraft();
      if (!added) return;
      next = added;
    }
    try {
      const normalized = normalizeSeeds(next);
      setFieldError(null);
      onSubmit(normalized);
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "키워드를 확인해 주세요.");
    }
  };

  const removeSeed = (target: string) => {
    onSeedsChange(seeds.filter((seed) => seed !== target));
    setFieldError(null);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 rounded-[12px] border border-bebe bg-white p-4 shadow-[var(--a2-card-shadow)] sm:p-5"
      aria-label="네이버 연관 키워드 탐색"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="min-w-0" htmlFor="naver-seed-keyword">
          <span className="mb-2 flex items-center justify-between gap-3 text-[12px] font-semibold text-hof">
            <span>Seed 키워드</span>
            <span className="font-normal text-foggy">{seeds.length}/{MAX_SEEDS}</span>
          </span>
          <div
            className="flex min-h-12 flex-wrap items-center gap-2 rounded-[8px] border border-bebe bg-white px-3 py-2 transition focus-within:border-hof focus-within:ring-2 focus-within:ring-black/10"
          >
            {seeds.map((seed) => (
              <span
                key={seed}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-[8px] bg-faint pl-3 pr-1.5 text-[12px] font-medium text-hof"
              >
                {seed}
                <button
                  type="button"
                  onClick={() => removeSeed(seed)}
                  aria-label={`${seed} seed 삭제`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-foggy transition hover:bg-bebe hover:text-hof focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hof"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            ))}
            <input
              id="naver-seed-keyword"
              name="seed"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setFieldError(null);
              }}
              onKeyDown={handleKeyDown}
              disabled={loading || seeds.length >= MAX_SEEDS}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? "naver-seed-help naver-seed-error" : "naver-seed-help"}
              autoComplete="off"
              placeholder={seeds.length ? "키워드 추가" : "예: 네이버 광고, SEO 컨설팅"}
              className="h-9 min-w-[180px] flex-1 bg-transparent px-1 text-[16px] text-hof outline-none placeholder:text-grey-500 disabled:cursor-not-allowed sm:text-[14px]"
            />
          </div>
        </label>
        <button
          type="submit"
          disabled={loading || (seeds.length === 0 && !draft.trim())}
          aria-busy={loading}
          className="inline-flex h-12 w-full items-center justify-center rounded-[8px] bg-hof px-7 text-[14px] font-semibold text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rausch disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
        >
          {loading ? "공식 데이터 조회 중…" : "연관 키워드 찾기"}
        </button>
      </div>
      <div className="mt-2 min-h-5">
        <p id="naver-seed-help" className="text-[11px] leading-5 text-foggy">
          쉼표 또는 Enter로 최대 5개를 추가합니다. NAVER Search Ads의 캐시된 공식 통계를 우선 사용합니다.
        </p>
        {fieldError && (
          <p id="naver-seed-error" role="alert" className="mt-1 text-[12px] font-medium text-rausch-600">
            {fieldError}
          </p>
        )}
      </div>
    </form>
  );
}
