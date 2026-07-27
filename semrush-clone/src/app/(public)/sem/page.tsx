import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "Search Engine Marketing | Semrush UI Clone" };

export default function SemPage() {
  return <DetailTemplate data={detailLandings.sem} />;
}
