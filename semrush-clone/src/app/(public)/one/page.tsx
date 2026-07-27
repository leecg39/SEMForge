import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "Semrush One | Semrush UI Clone" };

export default function OnePage() {
  return <DetailTemplate data={detailLandings.one} />;
}
