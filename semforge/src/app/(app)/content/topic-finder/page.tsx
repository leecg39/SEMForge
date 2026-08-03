import { redirect } from "next/navigation";
import { contentRedirectHref, type RouteSearchParams } from "@/lib/content-routes";

export default async function LegacyTopicFinderPage({ searchParams }: { searchParams: Promise<RouteSearchParams> }) {
  redirect(contentRedirectHref("/content/", await searchParams, { intent: "topic" }));
}
