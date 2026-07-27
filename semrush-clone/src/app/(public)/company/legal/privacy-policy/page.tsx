import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "Privacy Policy | Semrush UI Clone" };

export default function PrivacyPage() {
  return <CorpTemplate data={corpData["legal/privacy-policy"]} />;
}
