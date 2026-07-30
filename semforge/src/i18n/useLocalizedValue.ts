"use client";

import { useMemo } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { localizeSiteValue, translateSiteText } from "@/i18n/site";

export function useLocalizedValue<T>(value: T): T {
  const { locale } = useLocale();
  return useMemo(() => localizeSiteValue(value, locale), [locale, value]);
}

export function useSiteText() {
  const { locale } = useLocale();
  return (text: string) => translateSiteText(locale, text);
}
