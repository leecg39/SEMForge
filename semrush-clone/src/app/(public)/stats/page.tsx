import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "Our Data | Semrush UI Clone" };

export default function StatsPage() {
  return <DetailTemplate data={detailLandings.stats} />;
}
