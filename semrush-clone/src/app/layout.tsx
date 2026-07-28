import { Agentation } from "agentation";
import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getLocale } from "@/i18n/server";
import "./globals.css";

// 디스플레이 폰트: 원본 자사 폰트(Lazzer/Factor A) 대신 시각적으로 유사한
// 오픈소스 폰트(Sora)로 대체. CSS 변수명은 유지해 컴포넌트 변경 불필요.
const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-lazzer",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Semrush UI/UX Clone",
  description:
    "UI/UX structural clone for study and prototyping. Not affiliated with Semrush.",
  icons: {
    icon: [{ url: "/seo/favicon.svg", type: "image/svg+xml" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${sora.variable} ${inter.variable} h-full antialiased`}
      style={{ ["--font-factor-a" as string]: "var(--font-lazzer)" }}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider initialLocale={locale}>
          {children}
          {/* 개발 중에만 로드되는 주석 툴바 */}
          {process.env.NODE_ENV === "development" && <Agentation />}
        </LocaleProvider>
      </body>
    </html>
  );
}
