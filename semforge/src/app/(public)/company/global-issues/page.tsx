import { CorpTemplate } from "@/components/templates/CorpTemplate";
import { corpData } from "@/data/corp";

export const metadata = { title: "Global Issues Index | SEMForge" };

export default function GlobalIssuesPage() {
  return <CorpTemplate data={corpData["global-issues"]} />;
}
