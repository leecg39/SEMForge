import HomeHero from "@/components/home/HomeHero";
import LogoMarquee from "@/components/home/LogoMarquee";
import PromoBlocks from "@/components/home/PromoBlocks";
import ToolkitsSlider from "@/components/home/ToolkitsSlider";
import StatsSection from "@/components/home/StatsSection";
import AiVisibilityIndex from "@/components/home/AiVisibilityIndex";
import TestimonialsAndResources from "@/components/home/TestimonialsAndResources";

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <LogoMarquee />
      <PromoBlocks />
      <ToolkitsSlider />
      <StatsSection />
      <AiVisibilityIndex />
      <TestimonialsAndResources />
    </>
  );
}
