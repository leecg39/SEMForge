import { Agentation } from "agentation";
import type { Metadata } from "next";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/600.css";
import "@fontsource/noto-sans-kr/700.css";
import "./globals.css";

// @TASK P1-F1-T1 - Independent Korean-first root layout
// @SPEC SEMForge paid beta plan#independent-brand
export const metadata: Metadata = {
  title: {
    default: "SEMForge — 주간 검색 가시성 리포트",
    template: "%s · SEMForge",
  },
  description:
    "Google 순위, AI Overview, Search Console, NAVER 수요 변화를 매주 한 장으로 정리하는 한국 SEO 대행사 리포트입니다.",
  applicationName: "SEMForge",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <a className="sf-skip-link" href="#main-content">
          본문 바로가기
        </a>
        {children}
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
