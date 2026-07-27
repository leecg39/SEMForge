import { HubTemplate } from "@/components/templates/HubTemplate";
import { hubs } from "@/data/hubs";

export const metadata = { title: "Integrations | Semrush UI Clone" };

export default function IntegrationsPage() {
  return <HubTemplate data={hubs.integrations} />;
}
