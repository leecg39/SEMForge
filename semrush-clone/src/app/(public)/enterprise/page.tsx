import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "Semrush Enterprise | Semrush UI Clone" };

export default function EnterprisePage() {
  return <DetailTemplate data={detailLandings.enterprise} />;
}
