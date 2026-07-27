import { FolderWorkspace } from "@/components/crud/FolderWorkspace";
import { folderSpec } from "@/data/crud/specs";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "폴더 · Semrush CRUD 클론" };

export default async function HomePage() {
  const { capabilities } = await pageSession();
  return <FolderWorkspace spec={folderSpec} capabilities={capabilities} />;
}
