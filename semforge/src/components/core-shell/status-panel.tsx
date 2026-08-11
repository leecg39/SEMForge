// @TASK P1-F1-T1 - Honest data-state panel
// @SPEC SEMForge paid beta plan#honest-data-states
// @TEST src/components/core-shell/core-shell.test.ts
import { CoreIcon } from "./core-icon";

export type DataStatus = "loading" | "error" | "empty" | "partial" | "ready";

const defaults: Record<DataStatus, { title: string; description: string }> = {
  loading: {
    title: "데이터를 확인하고 있습니다",
    description: "연결된 공급자의 응답을 기다리는 중입니다.",
  },
  error: {
    title: "데이터를 불러오지 못했습니다",
    description: "잠시 후 다시 시도하거나 연결 설정을 확인해 주세요.",
  },
  empty: {
    title: "첫 데이터를 준비해 주세요",
    description: "사이트와 데이터 공급자를 연결하면 주간 리포트 준비가 시작됩니다.",
  },
  partial: {
    title: "일부 데이터만 확인되었습니다",
    description: "확인 가능한 데이터만 표시하며, 누락된 영역은 임의 값으로 채우지 않습니다.",
  },
  ready: {
    title: "연결된 데이터를 확인했습니다",
    description: "확인된 실제 데이터만 다음 주간 리포트에 반영됩니다.",
  },
};

export function StatusPanel({
  status,
  title,
  description,
  action,
  detail,
}: {
  status: DataStatus;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  detail?: string;
}) {
  const copy = defaults[status];
  const liveRole = status === "error" ? "alert" : "status";
  const icon = status === "error" || status === "partial" ? "alert" : status === "ready" ? "check" : "clock";

  return (
    <section
      className={`sf-status sf-status--${status}`}
      role={liveRole}
      aria-live={status === "error" ? "assertive" : "polite"}
      aria-busy={status === "loading" || undefined}
    >
      <span className="sf-status__icon">
        <CoreIcon name={icon} size={22} />
      </span>
      <div className="sf-status__body">
        <h2>{title ?? copy.title}</h2>
        <p>{description ?? copy.description}</p>
        {detail && <small>{detail}</small>}
        {action && <div className="sf-status__action">{action}</div>}
      </div>
    </section>
  );
}
