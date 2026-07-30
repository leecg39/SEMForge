import { ContentListTemplate } from "@/components/templates/ContentListTemplate";
import { webinarsList } from "@/data/content";

export const metadata = { title: "Webinars | SEMForge" };

export default function WebinarsPage() {
  return <ContentListTemplate data={webinarsList} />;
}
