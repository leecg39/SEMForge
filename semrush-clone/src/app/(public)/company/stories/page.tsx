import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { storiesList } from "@/data/content";

export const metadata = { title: "Success Stories | Semrush UI Clone" };

export default function StoriesPage() {
  return <ContentListTemplate data={storiesList} />;
}
