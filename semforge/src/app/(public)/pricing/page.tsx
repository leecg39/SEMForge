import { PricingTemplate } from "@/components/templates/PricingTemplate";
import { pricingHub } from "@/data/pricing";

export const metadata = { title: "Pricing | SEMForge" };

export default function PricingHubPage() {
  return <PricingTemplate data={pricingHub} />;
}
