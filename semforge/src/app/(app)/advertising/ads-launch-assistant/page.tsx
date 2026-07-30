import { AppShell } from "@/components/app/AppShell";
import { AdsLaunchAssistant } from "@/components/advertising/AdsLaunchAssistant";

export default function AdsLaunchAssistantPage() {
  return (
    <AppShell activeToolkit="advertising" activeHref="/advertising/ads-launch-assistant">
      <AdsLaunchAssistant />
    </AppShell>
  );
}
