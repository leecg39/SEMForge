// @TASK P4-F1-T1 - Honest resource loading/error/unavailable states
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import { StatusPanel } from "@/components/core-shell/status-panel";

import type { ResourceState } from "./api-client";

export function ResourcePanel<T>({
  state,
  label,
  onRetry,
  children,
}: {
  state: ResourceState<T>;
  label: string;
  onRetry: () => void;
  children: (data: T) => React.ReactNode;
}) {
  if (state.status === "loading") {
    return <StatusPanel status="loading" title={`${label} 데이터를 확인하고 있습니다`} />;
  }
  if (state.status === "error") {
    return (
      <StatusPanel
        status="error"
        title={`${label} 데이터를 불러오지 못했습니다`}
        description={state.message}
        detail={state.requestId ? `요청 ID: ${state.requestId}` : undefined}
        action={<button className="sf-button sf-button--secondary" type="button" onClick={onRetry}>다시 시도</button>}
      />
    );
  }
  return children(state.data);
}
