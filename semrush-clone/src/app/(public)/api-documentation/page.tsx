import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { apiDocumentationList } from "@/data/misc";

export const metadata = { title: "API Documentation | Semrush UI Clone" };

export default function ApiDocumentationPage() {
  return <ContentListTemplate data={apiDocumentationList} />;
}
