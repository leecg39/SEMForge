import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { AppEditorTemplate } from "@/components/app/AppEditorTemplate";
import { editors } from "@/data/app-pages";

export function generateStaticParams() {
  return [{ action: "create" }, { action: "optimize" }, { action: "repurpose" }];
}

export default async function ArticleEditorPage({
  params,
}: {
  params: Promise<{ action: string }>;
}) {
  const { action } = await params;
  const data = editors[`/content/articles/${action}/`];
  if (!data) notFound();
  return (
    <AppShell activeToolkit="content" activeHref={`/content/articles/${action}/`}>
      <AppEditorTemplate data={data} />
    </AppShell>
  );
}
