import { ContentDetailTemplate } from "@/components/templates/ContentDetailTemplate";
import { apiDocs } from "@/data/misc";

export const metadata = { title: "Accounts API | Semrush UI Clone" };

export default function ApiAccountsPage() {
  return <ContentDetailTemplate data={apiDocs["api-accounts"]} />;
}
