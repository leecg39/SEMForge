import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { apiDocumentationList } from "@/data/misc";

export const metadata = { title: "API Documentation | SEMForge" };

export default function ApiDocumentationPage() {
  return <ContentListTemplate data={apiDocumentationList} />;
}
