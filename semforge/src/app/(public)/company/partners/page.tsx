import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "Partners | SEMForge" };

export default function PartnersPage() {
  return <CorpTemplate data={corpData.partners} />;
}
