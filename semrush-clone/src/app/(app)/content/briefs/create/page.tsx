import { AppShell } from "@/components/app/AppShell";
import { AppEditorTemplate } from "@/components/app/AppEditorTemplate";
import { editors } from "@/data/app-pages";

export default function BriefCreatePage() {
  return (
    <AppShell activeToolkit="content" activeHref="/content/briefs/create/">
      <AppEditorTemplate data={editors["/content/briefs/create/"]} />
    </AppShell>
  );
}
