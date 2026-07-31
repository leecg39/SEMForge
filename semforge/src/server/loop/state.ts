import { z } from "zod";

/**
 * Loop Engineering 자동통합 루프의 실행 상태와 배정 규칙.
 *
 * docs/loop-engineering.md 의 상태 머신을 코드로 강제한다. 오케스트레이터가
 * "작업자가 끝났다고 했으니 통합해도 된다"는 판단을 할 수 없도록, 전이 규칙과
 * 종료 조건을 데이터로 고정하는 것이 이 모듈의 목적이다.
 *
 * 모든 함수는 순수하며 입력 상태를 변경하지 않고 새 객체를 반환한다.
 */

export const TASK_STATES = [
  "QUEUED",
  "READY",
  "RUNNING",
  "WORKER_DONE",
  "VERIFYING",
  "INTEGRATING",
  "INTEGRATED",
  "RETRYING",
  "CONFLICT",
  "BLOCKED",
  "REJECTED",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

/** 실패 원인 분류. 재시도 판단과 BASELINE_FAILURE 구분에 쓴다. */
export const FAILURE_CAUSES = [
  "IMPLEMENTATION_ERROR",
  "TEST_ERROR",
  "ENVIRONMENT_ERROR",
  "DEPENDENCY_ERROR",
  "SPEC_AMBIGUITY",
  "FLAKY_FAILURE",
  "BASELINE_FAILURE",
  "TIMEOUT",
  "SCOPE_VIOLATION",
] as const;

/** 검증 게이트 결과. 실행하지 못한 검사는 PASS 가 아니라 NOT_RUN 이다. */
export const GATE_STATUSES = ["PASS", "FAIL", "NOT_RUN"] as const;

/**
 * 병렬 실행을 금지하는 공유 경로.
 * 최근 커밋 이력에서 변경이 겹치는 상위 파일과 전역 설정·lock 파일을 모았다.
 * 특히 drizzle 마이그레이션은 meta/_journal.json 을 매번 갱신하므로 구조적으로 직렬이다.
 */
export const SERIAL_ONLY_PATHS = [
  "src/db/schema/",
  "src/db/migrations/",
  "src/types/crud.ts",
  "src/server/resources.ts",
  "src/server/providers/types.ts",
  "src/lib/api.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.ts",
  "drizzle.config.ts",
  "eslint.config.mjs",
] as const;

/** 상태별 허용 전이. 여기에 없는 조합은 모두 거부된다. */
const LEGAL_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  QUEUED: ["READY", "BLOCKED", "REJECTED"],
  READY: ["RUNNING", "BLOCKED", "REJECTED"],
  RUNNING: ["WORKER_DONE", "RETRYING", "BLOCKED", "REJECTED"],
  // 작업자 완료 보고는 검증 시작 신호일 뿐이라 통합으로 직행할 수 없다.
  WORKER_DONE: ["VERIFYING"],
  VERIFYING: ["INTEGRATING", "RETRYING", "CONFLICT", "BLOCKED", "REJECTED"],
  INTEGRATING: ["INTEGRATED", "CONFLICT", "RETRYING"],
  INTEGRATED: [],
  RETRYING: ["READY", "BLOCKED", "REJECTED"],
  CONFLICT: ["VERIFYING", "BLOCKED", "REJECTED"],
  BLOCKED: ["READY", "REJECTED"],
  REJECTED: [],
};

/** 브랜치·파일 소유권을 계속 점유하는 상태. 경로 충돌 판정에 쓴다. */
const OWNERSHIP_HOLDING_STATES: readonly TaskState[] = [
  "RUNNING",
  "WORKER_DONE",
  "VERIFYING",
  "INTEGRATING",
  "CONFLICT",
  "RETRYING",
];

/** 작업자 슬롯을 실제로 소비하는 상태. */
const SLOT_OCCUPYING_STATES: readonly TaskState[] = ["RUNNING"];

export const loopTaskSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  state: z.enum(TASK_STATES).default("QUEUED"),
  /** 이 작업만 수정할 수 있는 경로. 디렉터리는 끝에 / 를 붙인다. */
  allowedPaths: z.array(z.string().min(1)).min(1),
  forbiddenPaths: z.array(z.string().min(1)).default([]),
  dependsOn: z.array(z.string().min(1)).default([]),
  branch: z.string().min(1).nullable().default(null),
  worktreePath: z.string().min(1).nullable().default(null),
  /** 워크트리 dev 서버 포트. 포트가 겹치면 서버를 띄울 수 없다. */
  port: z.number().int().positive().nullable().default(null),
  retries: z.number().int().min(0).default(0),
  requiresApproval: z.boolean().default(false),
  approvedAt: z.string().min(1).nullable().default(null),
  /** TalorData·Firecrawl·PSI 등 실과금 API 를 호출하는 작업인지 여부. */
  usesPaidApi: z.boolean().default(false),
  lastFailureCause: z.enum(FAILURE_CAUSES).nullable().default(null),
});

export type LoopTask = z.output<typeof loopTaskSchema>;
export type LoopTaskInput = z.input<typeof loopTaskSchema>;

export const loopStateSchema = z.object({
  runId: z.string().min(1),
  projectGoal: z.string().min(1),
  baseBranch: z.string().min(1),
  integrationBranch: z.string().min(1),
  loopCycle: z.number().int().min(0).default(0),
  maxParallelTasks: z.number().int().min(1).max(4).default(2),
  maxRetriesPerTask: z.number().int().min(0).default(3),
  maxLoopCycles: z.number().int().min(1).default(10),
  /** 이번 실행에서 허용한 실과금 외부 호출 수. 기본 0 은 "실과금 작업 금지"를 뜻한다. */
  externalCallBudget: z.number().int().min(0).default(0),
  externalCallsUsed: z.number().int().min(0).default(0),
  /** 착수 시점에 이미 실패하던 검사. 새 변경이 만든 실패와 구분한다. */
  baselineFailures: z.array(z.string().min(1)).default([]),
  tasks: z.record(z.string().min(1), loopTaskSchema),
  lastHeartbeat: z.string().min(1),
});

export type LoopState = z.output<typeof loopStateSchema>;

export interface CreateLoopStateInput {
  runId: string;
  projectGoal: string;
  baseBranch: string;
  integrationBranch: string;
  tasks: LoopTaskInput[] | Record<string, LoopTaskInput>;
  loopCycle?: number;
  maxParallelTasks?: number;
  maxRetriesPerTask?: number;
  maxLoopCycles?: number;
  externalCallBudget?: number;
  externalCallsUsed?: number;
  baselineFailures?: string[];
  now?: string;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

function parseOrThrow(raw: unknown): LoopState {
  const result = loopStateSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`[loop] 루프 상태가 유효하지 않습니다 — ${formatIssues(result.error)}`);
  }
  return result.data;
}

export function createLoopState(input: CreateLoopStateInput): LoopState {
  const { tasks, now, ...rest } = input;
  const list = Array.isArray(tasks) ? tasks : Object.values(tasks);
  const record: Record<string, LoopTaskInput> = {};
  for (const task of list) {
    record[task.id] = task;
  }
  return parseOrThrow({ ...rest, tasks: record, lastHeartbeat: now ?? new Date().toISOString() });
}

/** 저장된 `.loop/state.json` 을 복구할 때 쓴다. 스키마 위반은 즉시 오류다. */
export function parseLoopState(raw: unknown): LoopState {
  return parseOrThrow(raw);
}

export function canTransition(from: TaskState, to: TaskState): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function applyTransition(state: LoopState, taskId: string, next: TaskState): LoopState {
  const current = state.tasks[taskId];
  if (!current) {
    throw new Error(`[loop] 알 수 없는 작업 id 입니다: ${taskId}`);
  }
  if (!canTransition(current.state, next)) {
    throw new Error(`[loop] ${taskId}: ${current.state} → ${next} 로는 전이할 수 없습니다.`);
  }
  return {
    ...state,
    tasks: { ...state.tasks, [taskId]: { ...current, state: next } },
  };
}

export function touchHeartbeat(state: LoopState, nowIso: string): LoopState {
  return { ...state, lastHeartbeat: nowIso };
}

function normalizePath(input: string): string {
  return input
    .trim()
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "");
}

function isUnder(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/** 두 경로 집합이 같은 파일·디렉터리를 건드리는지 판정한다. */
export function pathsOverlap(left: readonly string[], right: readonly string[]): boolean {
  const normalizedRight = right.map(normalizePath).filter((path) => path.length > 0);
  return left
    .map(normalizePath)
    .filter((path) => path.length > 0)
    .some((a) => normalizedRight.some((b) => isUnder(a, b) || isUnder(b, a)));
}

export function touchesSerialPath(paths: readonly string[]): boolean {
  return pathsOverlap(paths, SERIAL_ONLY_PATHS);
}

export function dependenciesSatisfied(state: LoopState, task: LoopTask): boolean {
  return task.dependsOn.every((id) => state.tasks[id]?.state === "INTEGRATED");
}

export function promoteReadyTasks(state: LoopState): LoopState {
  const tasks: Record<string, LoopTask> = {};
  for (const [id, task] of Object.entries(state.tasks)) {
    const promote = task.state === "QUEUED" && dependenciesSatisfied(state, task);
    tasks[id] = promote ? { ...task, state: "READY" } : task;
  }
  return { ...state, tasks };
}

/** 직렬 전용 작업을 먼저 처리해 공유 파일 대기가 길어지지 않게 한다. */
function compareCandidates(a: LoopTask, b: LoopTask): number {
  const serialA = touchesSerialPath(a.allowedPaths) ? 0 : 1;
  const serialB = touchesSerialPath(b.allowedPaths) ? 0 : 1;
  if (serialA !== serialB) return serialA - serialB;
  return a.id.localeCompare(b.id);
}

/**
 * 지금 즉시 실행해도 안전한 작업만 골라낸다.
 * 슬롯 한도, 의존성, 파일 소유권, 직렬 전용 경로, 승인, 실과금 예산을 모두 만족해야 한다.
 */
export function selectDispatchableTasks(state: LoopState): LoopTask[] {
  const all = Object.values(state.tasks);
  const holders = all.filter((task) => OWNERSHIP_HOLDING_STATES.includes(task.state));
  const occupiedSlots = all.filter((task) => SLOT_OCCUPYING_STATES.includes(task.state)).length;
  const freeSlots = state.maxParallelTasks - occupiedSlots;
  if (freeSlots <= 0) return [];

  const heldPaths = holders.flatMap((task) => task.allowedPaths);
  const budgetExhausted = state.externalCallsUsed >= state.externalCallBudget;

  const candidates = all
    .filter((task) => task.state === "READY")
    .filter((task) => !task.requiresApproval || task.approvedAt !== null)
    .filter((task) => dependenciesSatisfied(state, task))
    .filter((task) => !(task.usesPaidApi && budgetExhausted))
    .filter((task) => !pathsOverlap(task.allowedPaths, heldPaths))
    .sort(compareCandidates);

  const picked: LoopTask[] = [];
  const pickedPaths: string[] = [];
  let paidInFlight = holders.some((task) => task.usesPaidApi);

  for (const candidate of candidates) {
    if (picked.length >= freeSlots) break;
    const isSerial = touchesSerialPath(candidate.allowedPaths);
    // 직렬 전용 작업은 다른 작업이 하나도 없을 때만 단독 실행한다.
    if (isSerial && (holders.length > 0 || picked.length > 0)) continue;
    if (candidate.usesPaidApi && paidInFlight) continue;
    if (pathsOverlap(candidate.allowedPaths, pickedPaths)) continue;

    picked.push(candidate);
    pickedPaths.push(...candidate.allowedPaths);
    if (candidate.usesPaidApi) paidInFlight = true;
    if (isSerial) break;
  }

  return picked;
}

function findDependencyCycles(state: LoopState): string[][] {
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const settled = new Set<string>();
  const stack: string[] = [];

  const walk = (id: string): void => {
    if (settled.has(id)) return;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start < 0 ? 0 : start), id]);
      return;
    }
    visiting.add(id);
    stack.push(id);
    for (const dep of state.tasks[id]?.dependsOn ?? []) {
      walk(dep);
    }
    stack.pop();
    visiting.delete(id);
    settled.add(id);
  };

  for (const id of Object.keys(state.tasks)) {
    walk(id);
  }
  return cycles;
}

/** 중단 후 복구할 때 상태 파일이 실제와 어긋났는지 먼저 확인한다. */
export function findStateInconsistencies(state: LoopState): string[] {
  const issues: string[] = [];
  for (const [key, task] of Object.entries(state.tasks)) {
    if (key !== task.id) {
      issues.push(`작업 키와 id 가 다릅니다: ${key} ≠ ${task.id}`);
    }
    if (task.dependsOn.includes(task.id)) {
      issues.push(`${task.id} 가 자기 자신에 의존합니다`);
    }
    for (const dep of task.dependsOn) {
      if (!state.tasks[dep]) {
        issues.push(`${task.id} 의 선행 작업을 찾을 수 없습니다: ${dep}`);
      }
    }
  }
  for (const cycle of findDependencyCycles(state)) {
    issues.push(`순환 의존성: ${cycle.join(" → ")}`);
  }
  return issues;
}

/** 문서 §15 종료 조건. 하나라도 남으면 "완료"라고 말할 수 없다. */
export function evaluateExitConditions(state: LoopState): { canExit: boolean; unmet: string[] } {
  const all = Object.values(state.tasks);
  const count = (states: readonly TaskState[]): number =>
    all.filter((task) => states.includes(task.state)).length;

  const unmet: string[] = [];
  const checks: Array<[number, string]> = [
    [count(["QUEUED", "READY"]), "대기 작업"],
    [count(["RUNNING"]), "실행 중인 작업"],
    [count(["WORKER_DONE", "VERIFYING", "INTEGRATING"]), "검증·통합 미완료 작업"],
    [count(["RETRYING"]), "재시도 중인 작업"],
    [count(["CONFLICT"]), "미해결 충돌"],
    [count(["BLOCKED"]), "차단된 작업"],
    [count(["REJECTED"]), "거부된 작업(재계획 필요)"],
    [
      all.filter((task) => task.requiresApproval && task.approvedAt === null && task.state !== "INTEGRATED")
        .length,
      "승인 대기 작업",
    ],
  ];
  for (const [amount, label] of checks) {
    if (amount > 0) unmet.push(`${label} ${amount}개`);
  }

  const inconsistencies = findStateInconsistencies(state);
  if (inconsistencies.length > 0) {
    unmet.push(`상태 불일치 ${inconsistencies.length}건: ${inconsistencies.join(" / ")}`);
  }

  return { canExit: unmet.length === 0, unmet };
}

/** 반복 한도를 넘으면 무한루프로 판단해 안전하게 멈춘다. */
export function shouldForceStop(state: LoopState): { stop: boolean; reason: string | null } {
  if (state.loopCycle > state.maxLoopCycles) {
    return {
      stop: true,
      reason: `반복 한도 초과 (${state.loopCycle}/${state.maxLoopCycles}) — 무한루프로 판단해 중단합니다.`,
    };
  }
  return { stop: false, reason: null };
}
