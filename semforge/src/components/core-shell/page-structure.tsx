// @TASK P1-F1-T1 - Reusable paid beta page structure
// @SPEC SEMForge paid beta plan#allowed-pages
import Link from "next/link";
import { CoreIcon } from "./core-icon";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="sf-page-header">
      <div>
        <p className="sf-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="sf-page-header__action">{action}</div>}
    </header>
  );
}

export function ContentCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="sf-card">
      <div className="sf-section-heading">
        <div>
          {eyebrow && <p className="sf-eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

export function SetupSteps() {
  const steps = [
    {
      title: "사이트 등록",
      description: "고객 도메인을 등록하고 추적 기준을 확인합니다.",
      href: "/app/sites",
      label: "사이트 설정",
    },
    {
      title: "Search Console 연결",
      description: "읽기 전용 권한으로 실제 검색 성과를 연결합니다.",
      href: "/app/settings",
      label: "연결 설정",
    },
    {
      title: "추적 질의 선택",
      description: "순위 키워드와 AI Overview 프롬프트를 사이트별로 선택합니다.",
      href: "/app/sites",
      label: "추적 항목 설정",
    },
  ] as const;

  return (
    <ol className="sf-setup-list">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="sf-setup-list__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </div>
          <Link href={step.href}>
            {step.label}
            <CoreIcon name="arrow" size={18} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function Breadcrumb({ href, label }: { href: string; label: string }) {
  return (
    <nav className="sf-breadcrumb" aria-label="현재 위치">
      <Link href={href}>← {label}</Link>
    </nav>
  );
}
