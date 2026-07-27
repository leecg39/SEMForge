import { HubTemplate } from "@/components/templates/HubTemplate";
import { hubs } from "@/data/hubs";

export const metadata = { title: "Free Tools | Semrush UI Clone" };

export default function FreeToolsHubPage() {
  return <HubTemplate data={hubs["free-tools"]} />;
}
