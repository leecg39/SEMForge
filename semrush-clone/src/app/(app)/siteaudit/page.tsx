import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function SiteAuditPage() {
  return (
    <AppShell activeToolkit="seo" activeHref="/siteaudit/">
      <AppWorkspaceTemplate data={workspaces["/siteaudit/"]} />
    </AppShell>
  );
}
