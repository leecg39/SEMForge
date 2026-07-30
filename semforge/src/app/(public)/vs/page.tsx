import { HubTemplate } from "@/components/templates/HubTemplate";
import { hubs } from "@/data/hubs";

export const metadata = { title: "Compare SEMForge | SEMForge" };

export default function VsHubPage() {
  return <HubTemplate data={hubs.vs} />;
}
