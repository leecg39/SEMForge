import { ContentDetailTemplate } from "@/components/templates/ContentDetailTemplate";
import { apiDocs } from "@/data/misc";

export const metadata = { title: "Analytics API | SEMForge" };

export default function ApiAnalyticsPage() {
  return <ContentDetailTemplate data={apiDocs["api-analytics"]} />;
}
