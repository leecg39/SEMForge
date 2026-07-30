import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "API Terms | SEMForge" };

export default function ApiTermsPage() {
  return <CorpTemplate data={corpData["api-terms"]} />;
}
