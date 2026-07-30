import { ContentDetailTemplate } from "@/components/templates/ContentDetailTemplate";
import { apiDocs } from "@/data/misc";

export const metadata = { title: "SEMForge Bot | SEMForge" };

export default function BotPage() {
  return <ContentDetailTemplate data={apiDocs.bot} />;
}
