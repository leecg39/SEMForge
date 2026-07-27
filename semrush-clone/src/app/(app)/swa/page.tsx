import { AppShell } from "@/components/app/AppShell";
import { AppEditorTemplate } from "@/components/app/AppEditorTemplate";
import { editors } from "@/data/app-pages";

export default function SwaPage() {
  return (
    <AppShell activeToolkit="seo" activeHref="/swa/">
      <AppEditorTemplate data={editors["/swa/"]} />
    </AppShell>
  );
}
