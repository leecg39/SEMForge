// @TASK P1-F1-T1 - Workspace settings page
// @SPEC SEMForge paid beta plan#fixed-report-branding
import { AppShell } from "@/components/core-shell/app-shell";
import { DataEndpointBoundary } from "@/components/core-shell/data-endpoint-boundary";
import { ContentCard, PageHeader } from "@/components/core-shell/page-structure";
import { WorkspaceSettingsForm } from "@/components/core-shell/workspace-settings-form";

export default function SettingsPage() {
  return (
    <AppShell active="settings">
      <PageHeader
        eyebrow="워크스페이스"
        title="설정"
        description="대행사 브랜드와 데이터 연결 상태를 관리합니다."
      />
      <div className="sf-page-stack">
        <DataEndpointBoundary
          endpoint="/api/v1/reports/branding"
          resourceLabel="리포트 브랜드"
          emptyTitle="워크스페이스 브랜드를 설정해 주세요"
          emptyDescription="대행사 이름, 로고와 강조색은 리포트 생성 시점의 스냅샷에 고정됩니다."
        />
        <ContentCard eyebrow="고정 템플릿" title="리포트 브랜드">
          <WorkspaceSettingsForm />
        </ContentCard>
        <ContentCard eyebrow="읽기 전용 연결" title="Google Search Console">
          <p className="sf-body-copy">
            연결 계정은 사용자가 정한 레이블로 구분합니다. 속성 조회에 필요한 최소 읽기 권한만 요청합니다.
          </p>
        </ContentCard>
      </div>
    </AppShell>
  );
}
