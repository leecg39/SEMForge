import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "SEMForge Enterprise | SEMForge" };

export default function EnterprisePage() {
  return <DetailTemplate data={detailLandings.enterprise} />;
}
