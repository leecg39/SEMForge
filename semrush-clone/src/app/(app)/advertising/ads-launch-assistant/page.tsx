import { AppShell } from "@/components/app/AppShell";
import { AppEditorTemplate } from "@/components/app/AppEditorTemplate";
import { editors } from "@/data/app-pages";

export default function AdsLaunchAssistantPage() {
  return (
    <AppShell activeToolkit="advertising" activeHref="/advertising/ads-launch-assistant">
      <AppEditorTemplate data={editors["/advertising/ads-launch-assistant"]} />
    </AppShell>
  );
}
