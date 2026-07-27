import { TrashWorkspace } from "@/components/crud/TrashWorkspace";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "휴지통 · Semrush CRUD 클론" };

export default async function TrashPage() {
  const { capabilities } = await pageSession();
  return <TrashWorkspace capabilities={capabilities} />;
}
