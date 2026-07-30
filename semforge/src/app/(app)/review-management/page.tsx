import { AppShell } from "@/components/app/AppShell";
import { ReviewsDashboard } from "@/components/local/ReviewsDashboard";

export default function ReviewManagementPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/review-management/">
      <ReviewsDashboard />
    </AppShell>
  );
}
