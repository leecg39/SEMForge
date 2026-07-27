import { AppShell } from "@/components/app/AppShell";
import { AppHomeTemplate } from "@/components/app/AppHomeTemplate";
import { appHome } from "@/data/app-pages";

export const metadata = { title: "Home | Semrush UI Clone" };

export default function AppHomePage() {
  return (
    <AppShell activeToolkit="home" activeHref="/home/" hideSideNav>
      <AppHomeTemplate data={appHome} />
    </AppShell>
  );
}
