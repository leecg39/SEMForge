import { notFound } from "next/navigation";
import { AiVisibilityDashboard } from "@/components/ai-visibility/AiVisibilityDashboard";

export default async function AiVisibilityPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { fid } = await searchParams;
  if (typeof fid !== "string" || !fid) notFound();
  return <AiVisibilityDashboard initialFolderId={fid} printMode />;
}
