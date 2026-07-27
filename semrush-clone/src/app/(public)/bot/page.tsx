import { ContentDetailTemplate } from "@/components/templates/ContentDetailTemplate";
import { apiDocs } from "@/data/misc";

export const metadata = { title: "Semrush Bot | Semrush UI Clone" };

export default function BotPage() {
  return <ContentDetailTemplate data={apiDocs.bot} />;
}
