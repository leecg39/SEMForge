import TopBanner from "@/components/shell/TopBanner";
import GlobalHeader from "@/components/shell/GlobalHeader";
import PublicFooter from "@/components/shell/PublicFooter";
import CookieConsentModal from "@/components/shell/CookieConsentModal";
import { getServerDictionary } from "@/i18n/server";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 로케일은 쿠키에 있으므로 셸을 서버에서 렌더하면서 사전을 내려준다.
  const { locale, dict } = await getServerDictionary();

  return (
    <>
      <TopBanner />
      <GlobalHeader dict={dict} />
      <main className="flex-1">{children}</main>
      <PublicFooter locale={locale} dict={dict} />
      <CookieConsentModal />
    </>
  );
}
