import { AppShell } from "@/components/app/AppShell";
import { PendingTool } from "@/components/local/PendingTool";

export default function GbpAiAgentPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/gbp-ai-agent/">
      <PendingTool
        toolkit="Local"
        title="GBP AI Agent"
        reason="리뷰 자동 답글·게시물 자동 생성 같은 에이전트 기능은 Google Business Profile 연동과 별도의 승인 정책이 먼저 필요합니다. 실데이터 연결이 안정화된 후 제공합니다."
      />
    </AppShell>
  );
}
