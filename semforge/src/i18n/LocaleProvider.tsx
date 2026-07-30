"use client";

import { Fragment, createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { api } from "@/lib/client-api";

interface LocaleContextValue {
  locale: Locale;
  switching: boolean;
  switchError: string | null;
  switchLocale: (next: Locale) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * URL을 바꾸지 않고 사이트 전체의 언어를 공유한다.
 *
 * API가 설정한 `sc_locale` 쿠키가 새로고침과 다음 방문을 담당하고, 클라이언트 상태는
 * 현재 화면의 공통 셸을 즉시 갱신한다. `router.refresh()`로 서버 컴포넌트도 같은 로케일로
 * 다시 렌더링한다.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocale] = useState(initialLocale);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const switchLocale = useCallback(
    async (next: Locale) => {
      if (next === locale || switching) return;

      setSwitching(true);
      setSwitchError(null);
      try {
        await api.post("/api/locale/", { locale: next });
        setLocale(next);
        document.documentElement.lang = next;
        router.refresh();
      } catch {
        setSwitchError(
          locale === "ko"
            ? "언어를 변경하지 못했습니다. 다시 시도해 주세요."
            : "Could not change the language. Please try again.",
        );
        throw new Error("LOCALE_SWITCH_FAILED");
      } finally {
        setSwitching(false);
      }
    },
    [locale, router, switching],
  );

  const value = useMemo(
    () => ({ locale, switching, switchError, switchLocale }),
    [locale, switching, switchError, switchLocale],
  );

  return (
    <LocaleContext.Provider value={value}>
      {/* 번역된 라벨을 탭/필터 상태 값으로 쓰는 화면도 새 로케일에서 안전하게 초기화한다. */}
      <Fragment key={locale}>{children}</Fragment>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside LocaleProvider");
  }
  return context;
}
