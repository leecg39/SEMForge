import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

const external: Record<string, { title: string; body: string; url: string }> = {
  "enterprise.semforge.com": {
    title: "SEMForge Enterprise",
    body: "Enterprise SEO and brand visibility for large organizations. This section lives on a separate subdomain.",
    url: "https://enterprise.semforge.com/",
  },
  "developer.semforge.com": {
    title: "SEMForge API & Developers",
    body: "API products and developer documentation. This section lives on a separate subdomain.",
    url: "https://developer.semforge.com/",
  },
  "careers.semforge.com": {
    title: "Careers at SEMForge",
    body: "Open roles and life at the company. This section lives on a separate subdomain.",
    url: "https://careers.semforge.com/",
  },
  "ai-visibility-index.semforge.com": {
    title: "AI Visibility Index",
    body: "Rankings of brands by visibility across AI search engines. This section lives on a separate subdomain.",
    url: "https://ai-visibility-index.semforge.com/",
  },
  "seoquake.com": {
    title: "SEOquake",
    body: "A free browser extension for on-page SEO checks. This is a separate product site.",
    url: "https://www.seoquake.com/",
  },
};

export function generateStaticParams() {
  return Object.keys(external).map((host) => ({ host }));
}

export default async function ExternalStubPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = await params;
  const item = external[host];
  if (!item) notFound();
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-24 text-center">
      <span className="text-[12px] font-semibold uppercase tracking-[0.24px] text-[#6c6e79]">
        External
      </span>
      <h1 className="max-w-[720px] font-[family-name:var(--font-lazzer)] text-[44px] font-semibold leading-[1.1] tracking-[-1.5px] text-[#181e15]">
        {item.title}
      </h1>
      <p className="max-w-[540px] text-[18px] text-[#6c6e79]">{item.body}</p>
      <Button href={item.url} external variant="primary" size="lg">
        Visit site
      </Button>
    </Container>
  );
}
