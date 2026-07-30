import { AppShell } from "@/components/app/AppShell";
import { AppStoreTemplate } from "@/components/app/AppStoreTemplate";
import { appStorePages } from "@/data/app-pages";

export const metadata = { title: "App Center | SEMForge" };

export default function AppStorePage() {
  return (
    <AppShell activeToolkit="apps" activeHref="/apps/" hideSideNav>
      <AppStoreTemplate data={appStorePages.store} />
    </AppShell>
  );
}
