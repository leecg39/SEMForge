import { HubTemplate } from "@/components/templates/HubTemplate";
import { hubs } from "@/data/hubs";

export const metadata = { title: "Solutions | SEMForge" };

export default function SolutionsHubPage() {
  return <HubTemplate data={hubs.solutions} />;
}
