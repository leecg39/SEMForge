import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { webinarsList } from "@/data/content";

export const metadata = { title: "Webinars | Semrush UI Clone" };

export default function WebinarsPage() {
  return <ContentListTemplate data={webinarsList} />;
}
