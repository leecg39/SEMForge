import { AppShell } from "@/components/app/AppShell";
import { AppEditorTemplate } from "@/components/app/AppEditorTemplate";
import { reportEditors } from "@/data/app-pages";

export default async function ReportConstructorPage({
  searchParams,
}: {
  searchParams: Promise<{ accordionTab?: string; template?: string }>;
}) {
  const { accordionTab, template } = await searchParams;
  const key =
    accordionTab === "themes"
      ? "themes"
      : accordionTab === "integrations"
        ? "integrations"
        : template && reportEditors[template]
          ? template
          : "base";
  return (
    <AppShell activeToolkit="reports" activeHref="/my_reports/constructor">
      <AppEditorTemplate data={reportEditors[key]} />
    </AppShell>
  );
}
