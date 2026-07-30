import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "About Us | SEMForge" };

export default function CompanyPage() {
  return <CorpTemplate data={corpData.company} />;
}
