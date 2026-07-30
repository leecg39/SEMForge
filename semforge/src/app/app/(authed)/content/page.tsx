import { ResourceWorkspace } from "@/components/crud/ResourceWorkspace";
import { contentSpec } from "@/data/crud/specs";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "콘텐츠 · SEMForge CRUD 클론" };

export default async function ContentPage() {
  const { capabilities } = await pageSession();
  return <ResourceWorkspace spec={contentSpec} capabilities={capabilities} />;
}
