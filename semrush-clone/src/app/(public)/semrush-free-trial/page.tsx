import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "Free Trial | Semrush UI Clone" };

export default function FreeTrialPage() {
  return <DetailTemplate data={detailLandings["semrush-free-trial"]} />;
}
