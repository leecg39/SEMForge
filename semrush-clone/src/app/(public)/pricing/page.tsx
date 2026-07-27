import { PricingTemplate } from "@/components/templates/PricingTemplate";
import { pricingHub } from "@/data/pricing";

export const metadata = { title: "Pricing | Semrush UI Clone" };

export default function PricingHubPage() {
  return <PricingTemplate data={pricingHub} />;
}
