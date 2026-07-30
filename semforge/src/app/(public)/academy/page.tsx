import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { academyList } from "@/data/content";

export const metadata = { title: "Academy | SEMForge" };

export default function AcademyPage() {
  return <ContentListTemplate data={academyList} />;
}
