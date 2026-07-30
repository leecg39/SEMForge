import { AppShell } from "@/components/app/AppShell";
import { AppLandingTemplate } from "@/components/app/AppLandingTemplate";
import { landings } from "@/data/app-pages";

export default function ReportsSuitePage() {
  return (
    <AppShell activeToolkit="reports" activeHref="/my_reports/suite">
      <AppLandingTemplate data={landings.reportsSuite} />
    </AppShell>
  );
}
