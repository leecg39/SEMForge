import { AppShell } from "@/components/app/AppShell";
import { ContentHome } from "@/components/content/ContentHome";

export default function ContentHomePage() {
  return (
    <AppShell activeToolkit="content" activeHref="/content/">
      <ContentHome />
    </AppShell>
  );
}
