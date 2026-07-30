import { AppShell } from "@/components/app/AppShell";
import { ListingsDashboard } from "@/components/local/ListingsDashboard";

export default function ListingsManagementPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/listings-management/">
      <ListingsDashboard />
    </AppShell>
  );
}
