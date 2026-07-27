import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "API Terms | Semrush UI Clone" };

export default function ApiTermsPage() {
  return <CorpTemplate data={corpData["api-terms"]} />;
}
