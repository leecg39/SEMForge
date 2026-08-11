// @TASK P4-F1-T1 - Report branding and GSC integrations page
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
import { AppShell } from "@/components/core-shell/app-shell";
import { PageHeader } from "@/components/core-shell/page-structure";
import { SettingsWorkspace } from "@/components/product/settings-workspace";

export default function SettingsPage() {
  return (
    <AppShell active="settings">
      <PageHeader
        eyebrow="워크스페이스"
        title="설정"
        description="대행사 브랜드와 데이터 연결 상태를 관리합니다."
      />
      <SettingsWorkspace />
    </AppShell>
  );
}
