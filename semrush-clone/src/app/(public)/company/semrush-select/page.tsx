import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "Semrush Select | Semrush UI Clone" };

export default function SemrushSelectPage() {
  return <CorpTemplate data={corpData["semrush-select"]} />;
}
