import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "Search Engine Marketing | SEMForge" };

export default function SemPage() {
  return <DetailTemplate data={detailLandings.sem} />;
}
