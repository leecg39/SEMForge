"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { SM, WidgetCard } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

/** Google 서비스 연결하기 스텁 (spec: widget-organic-backlinks.spec.md C-1) */
export function WidgetGoogleConnect() {
  const { locale } = useLocale();
  const ko = locale === "ko";
  return (
    <WidgetCard big ariaLabel={ko ? "Google 서비스 연결하기" : "Connect Google services"} className="xl:col-span-4">
      <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
        <div className="flex items-center gap-3">
          <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[8px] border border-app-border bg-white text-[15px] font-bold text-[#4285F4]">G</span>
          <span aria-hidden="true" className="text-[18px] text-a2-text-muted">+</span>
          <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[8px] border border-app-border bg-white text-[15px] font-bold text-[#34A853]">SC</span>
        </div>
        <h3 className={cn("text-[16px] font-bold leading-[20px]", SM.stub)}>
          {ko ? "Google 서비스 연결하기" : "Connect Google services"}
        </h3>
        <p className={cn("max-w-[420px] text-[14px] leading-[20px]", SM.stub)}>
          {ko
            ? "SEO 대시보드에서 Google 애널리틱스와 Google Search Console의 실시간 데이터를 사용해 분석의 품질을 높여보세요."
            : "Use real-time data from Google Analytics and Google Search Console to improve the quality of your analysis on the SEO dashboard."}
        </p>
        <div className="flex items-center gap-3">
          <button type="button" disabled className={cn(SM.darkCta, "h-[32px] cursor-not-allowed opacity-50")}>
            {ko ? "연결" : "Connect"}
          </button>
          <button type="button" className={cn("text-[14px] leading-[20px] hover:underline", SM.stub)}>
            {ko ? "면책조항" : "Disclaimer"}
          </button>
        </div>
      </div>
    </WidgetCard>
  );
}

/** 숨겨진 위젯 스텁 (spec: widget-organic-backlinks.spec.md C-2) */
export function WidgetHiddenWidgets() {
  const { locale } = useLocale();
  const ko = locale === "ko";
  return (
    <WidgetCard ariaLabel={ko ? "숨겨진 위젯" : "Hidden widgets"} className="xl:col-span-4">
      <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
        <h3 className={cn("text-[16px] font-bold leading-[20px]", SM.body)}>
          {ko ? "숨겨진 위젯" : "Hidden widgets"}
        </h3>
        <p className={cn("text-[16px] font-bold leading-[22px]", SM.stub)}>
          {ko ? "대시보드에 모든 위젯이 표시됩니다" : "All widgets are shown on the dashboard"}
        </p>
      </div>
    </WidgetCard>
  );
}
