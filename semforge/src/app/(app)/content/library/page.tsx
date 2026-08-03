import { AppShell } from "@/components/app/AppShell";
import { ContentLibrary } from "@/components/content/ContentLibrary";

export default function ContentLibraryPage() {
  return (
    <AppShell activeToolkit="content" activeHref="/content/library/">
      <ContentLibrary />
    </AppShell>
  );
}
