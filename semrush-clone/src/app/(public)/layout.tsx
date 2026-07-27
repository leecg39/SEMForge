import TopBanner from "@/components/shell/TopBanner";
import GlobalHeader from "@/components/shell/GlobalHeader";
import PublicFooter from "@/components/shell/PublicFooter";
import CookieConsentModal from "@/components/shell/CookieConsentModal";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBanner />
      <GlobalHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
      <CookieConsentModal />
    </>
  );
}
