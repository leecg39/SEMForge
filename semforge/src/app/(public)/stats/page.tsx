import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "Our Data | SEMForge" };

export default function StatsPage() {
  return <DetailTemplate data={detailLandings.stats} />;
}
