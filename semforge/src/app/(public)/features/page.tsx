import { HubTemplate } from "@/components/templates/HubTemplate";
import { hubs } from "@/data/hubs";

export const metadata = { title: "Features | SEMForge" };

export default function FeaturesHubPage() {
  return <HubTemplate data={hubs.features} />;
}
