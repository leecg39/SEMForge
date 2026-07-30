import { ResourceWorkspace } from "@/components/crud/ResourceWorkspace";
import { reportSpec } from "@/data/crud/specs";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "보고서 · SEMForge CRUD 클론" };

export default async function ReportsPage() {
  const { capabilities } = await pageSession();
  return <ResourceWorkspace spec={reportSpec} capabilities={capabilities} />;
}
