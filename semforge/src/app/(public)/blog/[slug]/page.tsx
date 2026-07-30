import { ContentDetailTemplate } from "@/components/templates/ContentDetailTemplate";
import { sampleArticle } from "@/data/content";

export function generateStaticParams() {
  return [{ slug: "keyword-strategy-that-compounds" }, { slug: "xml-sitemap" }];
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await params;
  return <ContentDetailTemplate data={sampleArticle} />;
}
