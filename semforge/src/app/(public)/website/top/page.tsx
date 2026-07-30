import { HubTemplate } from "@/components/templates/HubTemplate";
import { hubs } from "@/data/hubs";

export const metadata = { title: "Top Websites | SEMForge" };

export default function TopWebsitesPage() {
  return <HubTemplate data={hubs["website-top"]} />;
}
