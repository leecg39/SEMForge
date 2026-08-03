import { notFound, redirect } from "next/navigation";
import { contentRedirectHref, type RouteSearchParams } from "@/lib/content-routes";

const intents = new Set(["create", "optimize", "repurpose"]);

export default async function LegacyArticleActionPage({
  params,
  searchParams,
}: {
  params: Promise<{ action: string }>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const { action } = await params;
  if (!intents.has(action)) notFound();
  redirect(contentRedirectHref("/content/", await searchParams, { intent: action }));
}
