import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { newsList } from "@/data/content";

export const metadata = { title: "Newsroom | SEMForge" };

export default function NewsPage() {
  return <ContentListTemplate data={newsList} />;
}
