import { AppShell } from "@/components/app/AppShell";
import { AppWorkspaceTemplate } from "@/components/app/AppWorkspaceTemplate";
import { workspaces } from "@/data/app-pages";

export default function BacklinkAuditPage() {
  return (
    <AppShell activeToolkit="seo" activeHref="/backlink_audit/">
      <AppWorkspaceTemplate data={workspaces["/backlink_audit/"]} />
    </AppShell>
  );
}
