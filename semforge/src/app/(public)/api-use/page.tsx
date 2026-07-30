import { ContentDetailTemplate } from "@/components/templates/ContentDetailTemplate";
import { apiDocs } from "@/data/misc";

export const metadata = { title: "API Use Guide | SEMForge" };

export default function ApiUsePage() {
  return <ContentDetailTemplate data={apiDocs["api-use"]} />;
}
