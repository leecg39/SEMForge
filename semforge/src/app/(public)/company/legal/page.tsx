import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "Terms of Service | SEMForge" };

export default function TermsPage() {
  return <CorpTemplate data={corpData["legal/terms"]} />;
}
