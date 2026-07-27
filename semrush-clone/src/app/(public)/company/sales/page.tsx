import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "Book a Demo | Semrush UI Clone" };

export default function SalesPage() {
  return <CorpTemplate data={corpData.sales} />;
}
