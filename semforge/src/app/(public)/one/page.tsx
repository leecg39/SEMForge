import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "SEMForge One | SEMForge" };

export default function OnePage() {
  return <DetailTemplate data={detailLandings.one} />;
}
