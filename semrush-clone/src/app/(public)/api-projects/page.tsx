import { ContentDetailTemplate } from "@/components/templates/ContentDetailTemplate";
import { apiDocs } from "@/data/misc";

export const metadata = { title: "Projects API | Semrush UI Clone" };

export default function ApiProjectsPage() {
  return <ContentDetailTemplate data={apiDocs["api-projects"]} />;
}
