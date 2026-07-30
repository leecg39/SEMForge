import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "Free Trial | SEMForge" };

export default function FreeTrialPage() {
  return <DetailTemplate data={detailLandings["free-trial"]} />;
}
