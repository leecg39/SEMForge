import { AppShell } from "@/components/app/AppShell";
import { PendingTool } from "@/components/local/PendingTool";

export const metadata = { title: "Advertising Research · SEMForge" };

/**
 * 광고 리서치(Advertising Research).
 *
 * /advertising/ 의 도메인 입력 폼과 좌측 내비게이션이 이 경로로 보내는데 라우트가 없어
 * 404 가 발생했다. 유료 광고 순위·광고 소재 데이터를 제공하는 소스가 연결되어 있지 않으므로
 * (TalorData SERP 는 자연 검색 결과만 파싱한다) 수치를 지어내지 않고 준비 중 상태를 표시한다.
 */
export default function AdvertisingPositionsPage() {
  return (
    <AppShell activeToolkit="advertising" activeHref="/analytics/adwords/positions/">
      <PendingTool
        toolkit="Advertising"
        title="Advertising Research"
        reason="경쟁사의 유료 광고 순위와 광고 소재를 보여주려면 광고 데이터 제공사 연동이 필요합니다. 현재 연결된 소스(TalorData SERP)는 자연 검색 결과만 수집하므로 광고 노출 순위·광고비 추정치를 제공할 수 없습니다. 키워드별 CPC 추정치는 SEO 도구의 키워드 화면에서 확인할 수 있습니다."
      />
    </AppShell>
  );
}
