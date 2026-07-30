import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { blogList } from "@/data/content";

export const metadata = { title: "Blog | SEMForge" };

export default function BlogPage() {
  return <ContentListTemplate data={blogList} />;
}
