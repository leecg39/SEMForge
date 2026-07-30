import { ResourceWorkspace } from "@/components/crud/ResourceWorkspace";
import { keywordListSpec } from "@/data/crud/specs";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "키워드 목록 · SEMForge CRUD 클론" };

export default async function KeywordListPage() {
  const { capabilities } = await pageSession();
  return <ResourceWorkspace spec={keywordListSpec} capabilities={capabilities} />;
}
