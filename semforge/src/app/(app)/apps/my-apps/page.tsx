import { AppShell } from "@/components/app/AppShell";
import { AppStoreTemplate } from "@/components/app/AppStoreTemplate";
import { appStorePages } from "@/data/app-pages";

export const metadata = { title: "My Apps | SEMForge" };

export default function MyAppsPage() {
  return (
    <AppShell activeToolkit="apps" activeHref="/apps/my-apps/" hideSideNav>
      <AppStoreTemplate data={appStorePages["my-apps"]} />
    </AppShell>
  );
}
