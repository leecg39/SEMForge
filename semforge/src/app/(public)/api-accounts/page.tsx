import { ContentDetailTemplate } from "@/components/templates/ContentDetailTemplate";
import { apiDocs } from "@/data/misc";

export const metadata = { title: "Accounts API | SEMForge" };

export default function ApiAccountsPage() {
  return <ContentDetailTemplate data={apiDocs["api-accounts"]} />;
}
