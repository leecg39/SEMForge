import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { academyList } from "@/data/content";

export const metadata = { title: "Academy | Semrush UI Clone" };

export default function AcademyPage() {
  return <ContentListTemplate data={academyList} />;
}
