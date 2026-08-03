import { SocialPage } from "../SocialPage";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return SocialPage({ mode: "poster", search: await searchParams });
}
