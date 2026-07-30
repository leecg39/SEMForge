import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { kbList } from "@/data/content";

export const metadata = { title: "Knowledge Base | SEMForge" };

export default function KbPage() {
  return <ContentListTemplate data={kbList} />;
}
