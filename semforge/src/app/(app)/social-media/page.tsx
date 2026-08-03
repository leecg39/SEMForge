import { redirect } from "next/navigation";
import { SocialPage } from "./SocialPage";

export default async function SocialMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;
  const tool = typeof search.tool === "string" ? search.tool : "";
  if (
    tool &&
    new Set(["poster", "tracker", "content-insights", "analytics"]).has(tool)
  ) {
    const query = new URLSearchParams();
    if (typeof search.fid === "string") query.set("fid", search.fid);
    redirect(`/social-media/${tool}/?${query.toString()}`);
  }
  return SocialPage({ mode: "dashboard", search });
}
