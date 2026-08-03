import { AppShell } from "@/components/app/AppShell";
import { SeoWidgetDashboard } from "@/components/seo-dash/SeoWidgetDashboard";
import { pageSession } from "@/server/page-auth";
import {
  createSeoPreferenceScope,
  getSeoDashboardSnapshot,
} from "@/server/seo-dashboard/snapshot";

export const dynamic = "force-dynamic";

export default async function SeoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const { domain } = await searchParams;
  const { auth, capabilities } = await pageSession();
  const snapshot = await getSeoDashboardSnapshot(auth, domain);
  const preferenceScope = createSeoPreferenceScope(auth, snapshot.currentDomain);

  return (
    <AppShell activeToolkit="seo" activeHref="/seo/">
      <SeoWidgetDashboard
        key={snapshot.currentDomain || "empty"}
        snapshot={snapshot}
        preferenceScope={preferenceScope}
        canManage={Boolean(capabilities.create)}
      />
    </AppShell>
  );
}
