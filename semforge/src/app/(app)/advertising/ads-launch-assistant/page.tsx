import { AppShell } from "@/components/app/AppShell";
import { AdvertisingCampaignWizard } from "@/components/advertising/AdvertisingCampaignWizard";

export default function AdsLaunchAssistantPage() {
  return (
    <AppShell activeToolkit="advertising" activeHref="/advertising/ads-launch-assistant">
      <AdvertisingCampaignWizard />
    </AppShell>
  );
}
