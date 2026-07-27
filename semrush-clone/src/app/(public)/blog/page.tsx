import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { blogList } from "@/data/content";

export const metadata = { title: "Blog | Semrush UI Clone" };

export default function BlogPage() {
  return <ContentListTemplate data={blogList} />;
}
