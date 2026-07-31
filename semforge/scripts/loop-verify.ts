import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  overallStatus,
  skippedGate,
  tailOf,
  TAIL_LINES,
  type GateResult,
  type GateStatus,
} from "@/server/loop/gates";

/**
 * 자동통합 루프의 독립 검증 게이트 실행기. `npm run loop:verify -- --task T1` 로 실행한다.
 *
 * 작업자의 "완료했습니다" 보고를 믿지 않고 오케스트레이터가 직접 돌리는 검사다.
 * 실행하지 못한 검사는 PASS 가 아니라 NOT_RUN 으로 사유와 함께 기록한다.
 *
 * 종료 코드: 0=전부 통과, 1=실패 있음, 2=실행된 게이트가 없음
 * 산출물: <repo>/.loop/validation/<task>.json
 */

const DEFAULT_TIMEOUT_SEC = 600;

const argsSchema = z.object({
  // 파일명으로 쓰이므로 경로 탈출 문자를 차단한다.
  task: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9._-]+$/, "작업 id 는 영문·숫자와 . _ - 만 사용할 수 있습니다"),
  loopDir: z.string().min(1).nullable(),
  withBuild: z.boolean(),
  withSmoke: z.boolean(),
  timeoutSec: z.number().int().min(10).max(3600),
});

type VerifyArgs = z.infer<typeof argsSchema>;

function parseArgs(argv: string[]): VerifyArgs {
  const read = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
  };
  const rawTimeout = read("--timeout");
  const result = argsSchema.safeParse({
    task: read("--task") ?? "adhoc",
    loopDir: read("--loop-dir"),
    withBuild: argv.includes("--with-build"),
    withSmoke: argv.includes("--with-smoke"),
    timeoutSec: rawTimeout === null ? DEFAULT_TIMEOUT_SEC : Number(rawTimeout),
  });
  if (!result.success) {
    const detail = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`[loop-verify] 인자가 올바르지 않습니다 — ${detail}`);
  }
  return result.data;
}

function resolveRepoRoot(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  const top = result.status === 0 ? result.stdout.trim() : "";
  return top.length > 0 ? top : path.resolve(cwd, "..");
}

function runGate(name: string, npmArgs: string[], cwd: string, timeoutSec: number): GateResult {
  const command = `npm ${npmArgs.join(" ")}`;
  const startedAt = Date.now();
  const result = spawnSync("npm", npmArgs, {
    cwd,
    encoding: "utf8",
    timeout: timeoutSec * 1000,
  });
  const durationMs = Date.now() - startedAt;

  if (result.error) {
    const timedOut = "code" in result.error && result.error.code === "ETIMEDOUT";
    return {
      name,
      command,
      status: timedOut ? "FAIL" : "NOT_RUN",
      exitCode: null,
      durationMs,
      reason: timedOut
        ? `제한 시간 ${timeoutSec}초를 초과했습니다 (TIMEOUT)`
        : `실행할 수 없습니다: ${result.error.message}`,
      tail: tailOf(result.stdout, result.stderr),
    };
  }

  return {
    name,
    command,
    status: result.status === 0 ? "PASS" : "FAIL",
    exitCode: result.status,
    durationMs,
    reason: result.status === 0 ? null : `종료 코드 ${result.status}`,
    tail: tailOf(result.stdout, result.stderr),
  };
}

/**
 * 네이티브 모듈 ABI 확인. Node 버전이 맞지 않으면 모든 게이트가 무의미하게 실패하므로
 * 게이트를 돌리기 전에 ENVIRONMENT_ERROR 로 분류해 멈춘다.
 */
async function probeNativeModule(): Promise<string | null> {
  try {
    await import("better-sqlite3");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message.split("\n")[0] : String(error);
  }
}

function printSummary(gates: GateResult[], overall: GateStatus, outputPath: string): void {
  console.log("\n[loop-verify] 게이트 결과");
  for (const gate of gates) {
    const seconds = (gate.durationMs / 1000).toFixed(1);
    const suffix = gate.reason === null ? "" : ` — ${gate.reason}`;
    console.log(`  ${gate.status.padEnd(8)} ${gate.name.padEnd(10)} ${seconds}s${suffix}`);
  }
  for (const gate of gates.filter((item) => item.status === "FAIL")) {
    console.log(`\n[loop-verify] ${gate.name} 실패 로그 (마지막 ${TAIL_LINES}줄)`);
    for (const line of gate.tail) console.log(`  | ${line}`);
  }
  console.log(`\n[loop-verify] 종합: ${overall} → ${outputPath}`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const repoRoot = resolveRepoRoot(cwd);
  const loopDir = args.loopDir ?? path.join(repoRoot, ".loop");
  const startedAt = new Date().toISOString();

  const nativeError = await probeNativeModule();
  const gates: GateResult[] = [];

  if (nativeError !== null) {
    const reason = `ENVIRONMENT_ERROR — 네이티브 모듈을 불러오지 못했습니다 (${process.version}): ${nativeError}. AGENTS.md 대로 Homebrew Node v25 로 실행하거나 npm rebuild better-sqlite3 를 실행하세요.`;
    for (const name of ["lint", "typecheck", "test"]) {
      gates.push(skippedGate(name, `npm run ${name}`, reason));
    }
  } else {
    gates.push(runGate("lint", ["run", "lint"], cwd, args.timeoutSec));
    gates.push(runGate("typecheck", ["run", "typecheck"], cwd, args.timeoutSec));
    gates.push(runGate("test", ["run", "test"], cwd, args.timeoutSec));
  }

  // build 는 dev 서버와 .next/ 를 공유해 실행 중 서버를 깨뜨리므로 명시적으로 켤 때만 돌린다.
  gates.push(
    args.withBuild && nativeError === null
      ? runGate("build", ["run", "build"], cwd, args.timeoutSec)
      : skippedGate(
          "build",
          "npm run build",
          "dev 서버와 .next/ 를 공유하므로 기본 제외 — 전용 워크트리에서 --with-build 로 실행하세요"
        )
  );

  gates.push(
    args.withSmoke && nativeError === null
      ? // 작업별 산출물이 smoke.json 하나로 덮어써지지 않도록 task 와 loop-dir 를 넘긴다.
        runGate(
          "smoke",
          ["run", "loop:smoke", "--", "--task", `${args.task}-smoke`, "--loop-dir", loopDir],
          cwd,
          args.timeoutSec
        )
      : skippedGate(
          "smoke",
          "npm run loop:smoke",
          "실행 중인 dev 서버가 필요합니다 — --with-smoke 와 LOOP_SMOKE_BASE_URL 로 실행하세요"
        )
  );

  const overall = overallStatus(gates);
  const payload = {
    taskId: args.task,
    startedAt,
    finishedAt: new Date().toISOString(),
    node: process.version,
    cwd,
    overall,
    gates,
  };

  const outputDir = path.join(loopDir, "validation");
  const outputPath = path.join(outputDir, `${args.task}.json`);
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[loop-verify] 검증 결과를 저장하지 못했습니다 (${outputPath}): ${detail}`);
  }

  printSummary(gates, overall, outputPath);
  if (overall === "FAIL") return 1;
  return overall === "NOT_RUN" ? 2 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
