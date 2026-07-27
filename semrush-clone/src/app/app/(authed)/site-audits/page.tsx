import { ResourceWorkspace } from "@/components/crud/ResourceWorkspace";
import { siteAuditSpec } from "@/data/crud/specs";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "사이트 감사 · Semrush CRUD 클론" };

export default async function SiteAuditPage() {
  const { capabilities } = await pageSession();
  return <ResourceWorkspace spec={siteAuditSpec} capabilities={capabilities} />;
}
