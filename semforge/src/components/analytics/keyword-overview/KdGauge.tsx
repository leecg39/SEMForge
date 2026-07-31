"use client";

/**
 * 키워드 난이도(0~100) 반원 게이지.
 * 색 구간은 Semrush KD 등급 팔레트를 따른다 (0–14 매우 쉬움 … 85–100 매우 어려움).
 */

export const KD_LEVELS = [
  { max: 14, color: "#009f81", en: "Very easy", ko: "매우 쉬움" },
  { max: 29, color: "#59ba63", en: "Easy", ko: "쉬움" },
  { max: 49, color: "#fdc23c", en: "Possible", ko: "보통" },
  { max: 69, color: "#ff8c43", en: "Difficult", ko: "어려움" },
  { max: 84, color: "#ff4953", en: "Hard", ko: "매우 어려움" },
  { max: 100, color: "#d1002f", en: "Very hard", ko: "극히 어려움" },
] as const;

export function kdLevel(score: number) {
  return KD_LEVELS.find((level) => score <= level.max) ?? KD_LEVELS[KD_LEVELS.length - 1];
}

export function KdGauge({ score, label }: { score: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, score));
  const level = kdLevel(clamped);
  // 반원 호: 반지름 44, 중심 (55, 55). 호 길이 = π·r ≈ 138.2
  const arcLength = Math.PI * 44;
  const filled = (clamped / 100) * arcLength;

  return (
    <div className="flex items-center gap-3">
      <svg width="110" height="64" viewBox="0 0 110 64" role="img" aria-label={`${label}: ${clamped}`}>
        <path
          d="M 11 55 A 44 44 0 0 1 99 55"
          fill="none"
          stroke="#e9ebf0"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M 11 55 A 44 44 0 0 1 99 55"
          fill="none"
          stroke={level.color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${arcLength}`}
        />
        <text
          x="55"
          y="52"
          textAnchor="middle"
          className="fill-a2-text"
          fontSize="22"
          fontWeight="600"
        >
          {clamped}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: level.color }}>
          {label}
        </p>
      </div>
    </div>
  );
}
