import { ResourceWorkspace } from "@/components/crud/ResourceWorkspace";
import { mediaListSpec } from "@/data/crud/specs";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "미디어 리스트 · SEMForge CRUD 클론" };

export default async function MediaListPage() {
  const { capabilities } = await pageSession();
  return <ResourceWorkspace spec={mediaListSpec} capabilities={capabilities} />;
}
