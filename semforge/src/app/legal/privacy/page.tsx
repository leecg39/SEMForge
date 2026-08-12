// @TASK P5-L1-T1 - Runtime-bound privacy notice
// @SPEC docs/release/legal-launch-gate.md
import type { Metadata } from "next";

import { readLegalReleaseManifest } from "@/app/legal/release";
import { PublicShell } from "@/components/core-shell/public-shell";
import {
  legalDocumentArtifactsFromManifest,
  type LegalDocumentArtifact,
} from "@/server/privacy/legal-documents";

export const metadata: Metadata = { title: "개인정보 처리방침" };
export const dynamic = "force-dynamic";

function LegalArticle({ artifact }: { artifact: LegalDocumentArtifact }) {
  return (
    <article className="sf-legal">
      <header>
        <p className="sf-eyebrow">{artifact.eyebrow}</p>
        <h1>{artifact.title}</h1>
        <p>시행일: {artifact.effectiveDate} · 문서 버전: {artifact.documentVersion}</p>
      </header>
      <aside role="note">{artifact.note}</aside>
      {artifact.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.items ? (
            <ul>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </section>
      ))}
    </article>
  );
}

export default function PrivacyPage() {
  const manifest = readLegalReleaseManifest();

  if (!manifest) {
    return (
      <PublicShell>
        <article className="sf-legal">
          <header>
            <p className="sf-eyebrow">출시 전 안내</p>
            <h1>개인정보 처리방침</h1>
          </header>
          <aside role="alert">
            개인정보 처리방침이 아직 승인·공개되지 않았습니다. 이 상태에서는 유료 비공개
            베타의 웹 런타임과 자동결제를 시작할 수 없습니다.
          </aside>
        </article>
      </PublicShell>
    );
  }

  const artifact = legalDocumentArtifactsFromManifest(manifest).privacy;
  return (
    <PublicShell>
      <LegalArticle artifact={artifact} />
    </PublicShell>
  );
}
