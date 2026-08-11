import { GATE_STATUSES } from "@/server/loop/state";

/**
 * 검증 게이트 결과 모델과 집계 규칙.
 *
 * scripts/loop-verify.ts 에서 분리했다. 스크립트는 최상위에서 main() 을 실행하므로
 * import 만 해도 프로세스가 돌아 단위 테스트를 붙일 수 없었다.
 * 부수효과 없는 판단 로직만 여기 둔다.
 */

export type GateStatus = (typeof GATE_STATUSES)[number];

export interface GateResult {
  name: string;
  command: string;
  status: GateStatus;
  /** 프로세스를 띄우지 못했거나 시간 초과면 null */
  exitCode: number | null;
  durationMs: number;
  /** NOT_RUN·FAIL 일 때 사용자에게 보여줄 사유 */
  reason: string | null;
  tail: string[];
}

/** 실패 진단용으로 남길 출력 줄 수. */
export const TAIL_LINES = 12;

/** stdout·stderr 를 합쳐 의미 있는 마지막 줄만 남긴다. */
export function tailOf(...streams: Array<string | null | undefined>): string[] {
  return streams
    .filter((stream): stream is string => typeof stream === "string")
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-TAIL_LINES);
}

/** 실행하지 못한 게이트. PASS 가 아니라 NOT_RUN 으로 남기고 사유를 붙인다. */
export function skippedGate(name: string, command: string, reason: string): GateResult {
  return { name, command, status: "NOT_RUN", exitCode: null, durationMs: 0, reason, tail: [] };
}

/**
 * 게이트 전체 판정.
 * 아무것도 실행하지 못한 경우를 PASS 로 보고하지 않는 것이 핵심이다.
 */
export function overallStatus(gates: readonly GateResult[]): GateStatus {
  if (gates.some((gate) => gate.status === "FAIL")) return "FAIL";
  return gates.some((gate) => gate.status === "PASS") ? "PASS" : "NOT_RUN";
}
