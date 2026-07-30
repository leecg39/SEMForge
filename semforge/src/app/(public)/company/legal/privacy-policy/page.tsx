import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "Privacy Policy | SEMForge" };

export default function PrivacyPage() {
  return <CorpTemplate data={corpData["legal/privacy-policy"]} />;
}
