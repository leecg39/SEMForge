import { AppShell } from "@/components/app/AppShell";
import { PendingTool } from "@/components/local/PendingTool";

export default function GbpOptimizationPage() {
  return (
    <AppShell activeToolkit="local" activeHref="/gbp-optimization/">
      <PendingTool
        toolkit="Local"
        title="GBP 최적화"
        reason="위치 정보 완성도 진단·사진/게시물 관리는 Google Business Profile 연결 후 프로필 필드를 분석해야 정직하게 동작합니다. 연결은 리스팅 관리에서 시작할 수 있으며, 분석 기능은 연결 데이터가 확보되는 대로 제공합니다."
      />
    </AppShell>
  );
}
