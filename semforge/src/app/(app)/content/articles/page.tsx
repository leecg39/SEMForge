import { redirect } from "next/navigation";
import { contentRedirectHref, type RouteSearchParams } from "@/lib/content-routes";

export default async function LegacyContentArticlesPage({ searchParams }: { searchParams: Promise<RouteSearchParams> }) {
  redirect(contentRedirectHref("/content/library/", await searchParams));
}
