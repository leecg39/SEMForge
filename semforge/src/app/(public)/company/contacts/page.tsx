import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "Contact Us | SEMForge" };

export default function ContactsPage() {
  return <CorpTemplate data={corpData.contacts} />;
}
