import { AppShell } from "@/components/app/AppShell";
import { BacklinkAudit, type BacklinkAuditTab } from "@/components/backlink-audit/BacklinkAudit";
import { pageSession } from "@/server/page-auth";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function BacklinkAuditPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await pageSession();
  const params = await searchParams;
  const rawTab = single(params.tab);
  const tabs: BacklinkAuditTab[] = ["overview", "audit", "removal", "disavow", "changes", "targets", "settings"];
  const tab = tabs.includes(rawTab as BacklinkAuditTab) ? rawTab as BacklinkAuditTab : "overview";
  return (
    <AppShell activeToolkit="seo" activeHref="/backlink_audit/">
      <BacklinkAudit initialProjectId={single(params.project)} initialTab={tab} />
    </AppShell>
  );
}
