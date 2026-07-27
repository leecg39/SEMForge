import { ResourceWorkspace } from "@/components/crud/ResourceWorkspace";
import { positionTrackingSpec } from "@/data/crud/specs";
import { pageSession } from "@/server/page-auth";

export const metadata = { title: "순위 추적 · Semrush CRUD 클론" };

export default async function PositionTrackingPage() {
  const { capabilities } = await pageSession();
  return <ResourceWorkspace spec={positionTrackingSpec} capabilities={capabilities} />;
}
