import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function OnPageSeoCheckerPage() {
  return (
    <AppShell activeToolkit="seo" activeHref="/on-page-seo-checker/">
      <AppWorkspaceTemplate data={workspaces["/on-page-seo-checker/"]} />
    </AppShell>
  );
}
