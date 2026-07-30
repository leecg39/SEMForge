import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "SEMForge Select | SEMForge" };

export default function SEMForgeSelectPage() {
  return <CorpTemplate data={corpData["select"]} />;
}
