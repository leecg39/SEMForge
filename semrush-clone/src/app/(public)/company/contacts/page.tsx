import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "Contact Us | Semrush UI Clone" };

export default function ContactsPage() {
  return <CorpTemplate data={corpData.contacts} />;
}
