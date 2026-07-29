import { AppShell } from "@/components/app/AppShell";
import { OnPageCheckerDashboard } from "@/components/onpage/OnPageCheckerDashboard";

export const dynamic = "force-dynamic";

/**
 * On Page SEO Checker — TalorData SERP + Firecrawl 페이지 스크레이프를 결합한
 * 라이브 도구. 기존 mock AppWorkspaceTemplate 을 대체한다.
 */
export default function OnPageSeoCheckerPage() {
  return (
    <AppShell activeToolkit="seo" activeHref="/on-page-seo-checker/">
      <OnPageCheckerDashboard />
    </AppShell>
  );
}
