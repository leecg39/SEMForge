import { HubTemplate } from "@/components/templates/HubTemplate";
import { hubs } from "@/data/hubs";

export const metadata = { title: "Solutions | Semrush UI Clone" };

export default function SolutionsHubPage() {
  return <HubTemplate data={hubs.solutions} />;
}
