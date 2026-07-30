/**
 * 로케일 설정.
 *
 * 원본은 `ko.semforge.com` / `www.semforge.com` 처럼 서브도메인으로 언어를 나눈다.
 * 이 클론은 단일 호스트에서 동작하므로 쿠키로 로케일을 유지한다.
 * URL 은 그대로 두어 246개 라우트를 언어별로 복제하지 않는다. (원본과 다른 점)
 */

export const LOCALES = ["en", "ko"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "sc_locale";

/** SEMForge가 제공하는 언어 목록. 공통 선택기는 실제 지원하는 en/ko만 노출한다. */
export const LANGUAGE_OPTIONS: { label: string; locale?: Locale }[] = [
  { label: "English", locale: "en" },
  { label: "한국어", locale: "ko" },
  { label: "Deutsch" },
  { label: "Español" },
  { label: "Français" },
  { label: "Italiano" },
  { label: "Nederlands" },
  { label: "Polski" },
  { label: "Português (Brasil)" },
  { label: "Svenska" },
  { label: "Tiếng Việt" },
  { label: "Türkçe" },
  { label: "中文" },
  { label: "日本語" },
];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
