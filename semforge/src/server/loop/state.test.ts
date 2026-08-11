import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyTransition,
  canTransition,
  createLoopState,
  dependenciesSatisfied,
  evaluateExitConditions,
  findStateInconsistencies,
  parseLoopState,
  pathsOverlap,
  promoteReadyTasks,
  selectDispatchableTasks,
  shouldForceStop,
  touchesSerialPath,
  touchHeartbeat,
  type LoopState,
  type LoopTaskInput,
} from "@/server/loop/state";

/** 테스트용 최소 작업 입력. 나머지 필드는 스키마 기본값으로 채워진다. */
function task(id: string, overrides: Partial<LoopTaskInput> = {}): LoopTaskInput {
  return { id, goal: `${id} 목적`, allowedPaths: [`src/app/${id}/`], ...overrides };
}

function makeState(tasks: LoopTaskInput[], overrides: Record<string, unknown> = {}): LoopState {
  return createLoopState({
    runId: "run-1",
    projectGoal: "테스트 목표",
    baseBranch: "main",
    integrationBranch: "loop/run-1/integration",
    tasks,
    ...overrides,
  });
}

test("정상 진행 경로의 상태 전이는 모두 허용된다", () => {
  const happyPath = [
    ["QUEUED", "READY"],
    ["READY", "RUNNING"],
    ["RUNNING", "WORKER_DONE"],
    ["WORKER_DONE", "VERIFYING"],
    ["VERIFYING", "INTEGRATING"],
    ["INTEGRATING", "INTEGRATED"],
  ] as const;
  for (const [from, to] of happyPath) {
    assert.equal(canTransition(from, to), true, `${from} → ${to} 는 허용돼야 한다`);
  }
});

test("단계를 건너뛰는 전이와 종료 상태에서의 전이는 거부된다", () => {
  assert.equal(canTransition("QUEUED", "INTEGRATED"), false);
  assert.equal(canTransition("RUNNING", "INTEGRATING"), false);
  assert.equal(canTransition("WORKER_DONE", "INTEGRATED"), false);
  assert.equal(canTransition("INTEGRATED", "READY"), false);
  assert.equal(canTransition("REJECTED", "READY"), false);
});

test("작업자 보고만으로 통합 상태로 갈 수 없고 검증 단계를 거쳐야 한다", () => {
  // 문서 §1-4: WORKER_DONE 은 검증 시작 신호일 뿐 통합 승인 신호가 아니다.
  assert.equal(canTransition("WORKER_DONE", "VERIFYING"), true);
  assert.equal(canTransition("WORKER_DONE", "INTEGRATING"), false);
});

test("실패 경로 전이(재시도·충돌·차단·거부)가 정의돼 있다", () => {
  assert.equal(canTransition("VERIFYING", "RETRYING"), true);
  assert.equal(canTransition("VERIFYING", "CONFLICT"), true);
  assert.equal(canTransition("VERIFYING", "REJECTED"), true);
  assert.equal(canTransition("RETRYING", "READY"), true);
  assert.equal(canTransition("CONFLICT", "VERIFYING"), true);
  assert.equal(canTransition("BLOCKED", "READY"), true);
});

test("applyTransition 은 원본 상태를 변경하지 않고 새 객체를 반환한다", () => {
  const before = makeState([task("T1", { state: "READY" })]);
  const after = applyTransition(before, "T1", "RUNNING");
  assert.equal(before.tasks.T1.state, "READY", "원본은 불변이어야 한다");
  assert.equal(after.tasks.T1.state, "RUNNING");
  assert.notEqual(before, after);
  assert.notEqual(before.tasks, after.tasks);
});

test("불법 전이와 알 수 없는 작업 id 는 오류를 던진다", () => {
  const state = makeState([task("T1", { state: "QUEUED" })]);
  assert.throws(() => applyTransition(state, "T1", "INTEGRATED"), /전이/);
  assert.throws(() => applyTransition(state, "NOPE", "READY"), /NOPE/);
});

test("touchHeartbeat 은 시각만 갱신하고 작업은 건드리지 않는다", () => {
  const before = makeState([task("T1")], { now: "2026-01-01T00:00:00.000Z" });
  const after = touchHeartbeat(before, "2026-01-01T00:05:00.000Z");
  assert.equal(before.lastHeartbeat, "2026-01-01T00:00:00.000Z");
  assert.equal(after.lastHeartbeat, "2026-01-01T00:05:00.000Z");
  assert.deepEqual(after.tasks, before.tasks);
});

test("경로 겹침은 디렉터리 접두사 경계를 지켜 판정한다", () => {
  assert.equal(pathsOverlap(["src/db/"], ["src/db/schema/domain.ts"]), true);
  assert.equal(pathsOverlap(["src/db"], ["src/db/schema/domain.ts"]), true);
  assert.equal(pathsOverlap(["src/lib/api.ts"], ["src/lib/api.ts"]), true);
  assert.equal(pathsOverlap(["./src/db/"], ["src/db/x.ts"]), true, "./ 접두사는 정규화된다");
  assert.equal(pathsOverlap(["src/db"], ["src/dbx.ts"]), false, "유사 접두사는 겹치지 않는다");
  assert.equal(pathsOverlap(["src/app/a/"], ["src/app/b/"]), false);
});

test("직렬 전용 경로(공유 스키마·설정·lock)를 감지한다", () => {
  assert.equal(touchesSerialPath(["src/db/schema/domain.ts"]), true);
  assert.equal(touchesSerialPath(["src/db/migrations/meta/_journal.json"]), true);
  assert.equal(touchesSerialPath(["package-lock.json"]), true);
  assert.equal(touchesSerialPath(["src/lib/api.ts"]), true);
  assert.equal(touchesSerialPath(["src/app/home/page.tsx"]), false);
});

test("의존성은 선행 작업이 INTEGRATED 일 때만 충족된다", () => {
  const pending = makeState([task("T1", { state: "VERIFYING" }), task("T2", { dependsOn: ["T1"] })]);
  assert.equal(dependenciesSatisfied(pending, pending.tasks.T2), false);
  const done = applyTransition(
    applyTransition(pending, "T1", "INTEGRATING"),
    "T1",
    "INTEGRATED"
  );
  assert.equal(dependenciesSatisfied(done, done.tasks.T2), true);
});

test("promoteReadyTasks 는 의존성이 충족된 QUEUED 작업만 READY 로 올린다", () => {
  const state = makeState([
    task("T1", { state: "INTEGRATED" }),
    task("T2", { dependsOn: ["T1"] }),
    task("T3", { dependsOn: ["T2"] }),
  ]);
  const promoted = promoteReadyTasks(state);
  assert.equal(promoted.tasks.T2.state, "READY");
  assert.equal(promoted.tasks.T3.state, "QUEUED", "선행 작업이 미완료면 대기 유지");
  assert.equal(state.tasks.T2.state, "QUEUED", "원본은 불변");
});

test("병렬 슬롯 한도를 넘겨 배정하지 않는다", () => {
  const state = makeState(
    [
      task("T1", { state: "READY" }),
      task("T2", { state: "READY" }),
      task("T3", { state: "READY" }),
    ],
    { maxParallelTasks: 2 }
  );
  assert.equal(selectDispatchableTasks(state).length, 2);
});

test("이미 실행 중인 작업이 슬롯을 차지한다", () => {
  const state = makeState(
    [task("T1", { state: "RUNNING" }), task("T2", { state: "READY" }), task("T3", { state: "READY" })],
    { maxParallelTasks: 2 }
  );
  const picked = selectDispatchableTasks(state).map((t) => t.id);
  assert.deepEqual(picked, ["T2"]);
});

test("소유권이 겹치는 작업은 실행 중 작업과 동시에 배정하지 않는다", () => {
  const state = makeState([
    task("T1", { state: "RUNNING", allowedPaths: ["src/server/gsc/"] }),
    task("T2", { state: "READY", allowedPaths: ["src/server/gsc/client.ts"] }),
    task("T3", { state: "READY", allowedPaths: ["src/server/gbp/"] }),
  ]);
  const picked = selectDispatchableTasks(state).map((t) => t.id);
  assert.deepEqual(picked, ["T3"]);
});

test("후보끼리 경로가 겹치면 하나만 배정한다", () => {
  const state = makeState([
    task("T1", { state: "READY", allowedPaths: ["src/server/gsc/"] }),
    task("T2", { state: "READY", allowedPaths: ["src/server/gsc/oauth.ts"] }),
  ]);
  assert.equal(selectDispatchableTasks(state).length, 1);
});

test("직렬 전용 경로 작업은 단독으로만 배정된다", () => {
  const serialOnly = makeState(
    [
      task("T1", { state: "READY", allowedPaths: ["src/db/schema/domain.ts"] }),
      task("T2", { state: "READY", allowedPaths: ["src/app/home/"] }),
    ],
    { maxParallelTasks: 2 }
  );
  const picked = selectDispatchableTasks(serialOnly);
  assert.equal(picked.length, 1);
  assert.equal(picked[0]?.id, "T1", "직렬 작업이 우선 선택되고 단독 실행된다");

  const occupied = makeState([
    task("T1", { state: "RUNNING", allowedPaths: ["src/app/home/"] }),
    task("T2", { state: "READY", allowedPaths: ["src/db/schema/domain.ts"] }),
  ]);
  assert.deepEqual(selectDispatchableTasks(occupied), [], "다른 작업이 점유 중이면 대기한다");
});

test("승인이 필요한 작업은 승인 전까지 배정하지 않는다", () => {
  const waiting = makeState([task("T1", { state: "READY", requiresApproval: true })]);
  assert.deepEqual(selectDispatchableTasks(waiting), []);

  const approved = makeState([
    task("T1", { state: "READY", requiresApproval: true, approvedAt: "2026-01-01T00:00:00.000Z" }),
  ]);
  assert.equal(selectDispatchableTasks(approved).length, 1);
});

test("실과금 API 작업은 동시에 하나만 배정한다", () => {
  // SERP 스냅샷 캐시가 워크트리별 data/app.db 에 있어 병렬 수집은 같은 쿼리도 중복 결제된다.
  const state = makeState(
    [
      task("T1", { state: "READY", usesPaidApi: true, allowedPaths: ["src/server/talordata/"] }),
      task("T2", { state: "READY", usesPaidApi: true, allowedPaths: ["src/server/siteaudit/"] }),
    ],
    { maxParallelTasks: 2, externalCallBudget: 100 }
  );
  assert.equal(selectDispatchableTasks(state).length, 1);
});

test("외부 호출 예산이 소진되면 실과금 작업을 배정하지 않는다", () => {
  const state = makeState(
    [
      task("T1", { state: "READY", usesPaidApi: true, allowedPaths: ["src/server/talordata/"] }),
      task("T2", { state: "READY", allowedPaths: ["src/app/home/"] }),
    ],
    { externalCallBudget: 10, externalCallsUsed: 10 }
  );
  const picked = selectDispatchableTasks(state).map((t) => t.id);
  assert.deepEqual(picked, ["T2"]);
});

test("READY 가 아닌 작업은 절대 배정되지 않는다", () => {
  const state = makeState([
    task("T1", { state: "QUEUED" }),
    task("T2", { state: "BLOCKED" }),
    task("T3", { state: "WORKER_DONE" }),
    task("T4", { state: "INTEGRATED" }),
  ]);
  assert.deepEqual(selectDispatchableTasks(state), []);
});

test("모든 작업이 통합되고 승인 대기가 없을 때만 종료할 수 있다", () => {
  const done = makeState([task("T1", { state: "INTEGRATED" }), task("T2", { state: "INTEGRATED" })]);
  const result = evaluateExitConditions(done);
  assert.equal(result.canExit, true);
  assert.deepEqual(result.unmet, []);
});

test("미완료·차단·거부·승인대기 작업은 각각 종료를 막고 사유로 보고된다", () => {
  const cases: Array<[Partial<LoopTaskInput>, RegExp]> = [
    [{ state: "QUEUED" }, /대기/],
    [{ state: "RUNNING" }, /실행/],
    [{ state: "VERIFYING" }, /검증/],
    [{ state: "RETRYING" }, /재시도/],
    [{ state: "CONFLICT" }, /충돌/],
    [{ state: "BLOCKED" }, /차단/],
    [{ state: "REJECTED" }, /거부/],
    [{ state: "READY", requiresApproval: true }, /승인/],
  ];
  for (const [overrides, pattern] of cases) {
    const state = makeState([task("T1", { state: "INTEGRATED" }), task("T2", overrides)]);
    const result = evaluateExitConditions(state);
    assert.equal(result.canExit, false, `${JSON.stringify(overrides)} 는 종료를 막아야 한다`);
    assert.ok(
      result.unmet.some((reason) => pattern.test(reason)),
      `사유에 ${pattern} 가 포함돼야 한다: ${result.unmet.join(" / ")}`
    );
  }
});

test("반복 한도를 넘으면 무한루프로 판단해 강제 중단한다", () => {
  const running = makeState([task("T1", { state: "READY" })], { loopCycle: 3, maxLoopCycles: 10 });
  assert.equal(shouldForceStop(running).stop, false);

  const exhausted = makeState([task("T1", { state: "READY" })], {
    loopCycle: 11,
    maxLoopCycles: 10,
  });
  const forced = shouldForceStop(exhausted);
  assert.equal(forced.stop, true);
  assert.match(forced.reason ?? "", /반복/);
});

test("상태 불일치(키 불일치·미지 의존성·순환 의존성)를 찾아낸다", () => {
  const healthy = makeState([task("T1", { state: "INTEGRATED" }), task("T2", { dependsOn: ["T1"] })]);
  assert.deepEqual(findStateInconsistencies(healthy), []);

  const unknownDep = makeState([task("T1", { dependsOn: ["GHOST"] })]);
  assert.ok(findStateInconsistencies(unknownDep).some((issue) => /GHOST/.test(issue)));

  const cyclic = makeState([
    task("T1", { dependsOn: ["T2"] }),
    task("T2", { dependsOn: ["T1"] }),
  ]);
  assert.ok(findStateInconsistencies(cyclic).some((issue) => /순환/.test(issue)));

  const mismatched: LoopState = {
    ...healthy,
    tasks: { WRONG_KEY: healthy.tasks.T1 },
  };
  assert.ok(findStateInconsistencies(mismatched).some((issue) => /WRONG_KEY/.test(issue)));
});

test("절대경로는 소유 경로로 쓸 수 없다", () => {
  // 절대경로를 허용하면 저장소 밖을 소유한다고 주장할 수 있고,
  // 상대경로 기준인 겹침 판정이 조용히 빗나간다.
  assert.throws(() => makeState([task("T1", { allowedPaths: ["/etc/passwd"] })]), /절대경로/);
  assert.throws(
    () => makeState([task("T1", { allowedPaths: ["src/a/"], forbiddenPaths: ["/var/log"] })]),
    /절대경로/
  );
  assert.throws(() => makeState([task("T1", { allowedPaths: ["~/secrets"] })]), /절대경로/);
});

test("상위 디렉터리 참조(..)가 든 경로는 거부한다", () => {
  // "src/../../other" 같은 경로는 정규화 전에는 겹치지 않아 보이지만 실제로는 밖을 가리킨다.
  assert.throws(() => makeState([task("T1", { allowedPaths: ["../other-repo/"] })]), /상위 디렉터리/);
  assert.throws(() => makeState([task("T1", { allowedPaths: ["src/../../etc"] })]), /상위 디렉터리/);
});

test("정상적인 상대경로는 그대로 통과한다", () => {
  const state = makeState([
    task("T1", { allowedPaths: ["src/server/gsc/", "src/lib/api.ts", "./scripts/x.ts"] }),
  ]);
  assert.equal(state.tasks.T1.allowedPaths.length, 3);
});

test("중복된 작업 id 는 조용히 덮어쓰지 않고 오류를 낸다", () => {
  // 배열 입력에서 같은 id 가 두 번 오면 뒤엣것이 앞엣것을 지워 작업이 유실된다.
  assert.throws(
    () => makeState([task("T1", { goal: "먼저" }), task("T1", { goal: "나중" })]),
    /중복/
  );
});

test("parseLoopState 는 저장된 상태를 검증하고 잘못된 값을 거부한다", () => {
  const original = makeState([task("T1", { state: "READY" })]);
  const restored = parseLoopState(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored, original);

  assert.throws(
    () => parseLoopState({ ...JSON.parse(JSON.stringify(original)), tasks: { T1: { id: "T1" } } }),
    /상태/
  );
});
