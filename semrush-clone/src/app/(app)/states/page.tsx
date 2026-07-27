import { AppShell } from "@/components/app/AppShell";
import { EmptyState, LoadingState, UpgradeGate } from "@/components/app/AppStateTemplates";

export const metadata = { title: "App States | Semrush UI Clone" };

export default function AppStatesPage() {
  return (
    <AppShell activeToolkit="home" activeHref="/states" hideSideNav>
      <div className="space-y-8 p-6">
        <section className="rounded-lg border border-app-border bg-white">
          <EmptyState
            title="No websites yet"
            body="Add your first website to start tracking visibility and performance."
            cta="Add website"
          />
        </section>
        <section className="rounded-lg border border-app-border bg-white p-6">
          <LoadingState />
        </section>
        <section className="rounded-lg border border-app-border bg-white">
          <UpgradeGate feature="Historical data" />
        </section>
      </div>
    </AppShell>
  );
}
