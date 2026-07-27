import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { newsList } from "@/data/content";

export const metadata = { title: "Newsroom | Semrush UI Clone" };

export default function NewsPage() {
  return <ContentListTemplate data={newsList} />;
}
