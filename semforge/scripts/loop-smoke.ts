import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  classifyStatus,
  isHardDenied,
  toRoutePath,
  usesPaidClient,
  type SmokeOutcome,
  type SmokeResult,
} from "@/server/loop/routes";

/**
 * 라우트 스모크 검사. `npm run loop:smoke -- --base http://localhost:3010` 로 실행한다.
 *
 * E2E 프레임워크가 없는 환경에서 "핸들러가 살아 있고 500 을 내지 않는다"를 확인하는
 * 최소 게이트다. GET 만 보내고, 실과금·파괴적 라우트는 기본 제외한다.
 * trailingSlash: true 설정에 맞춰 모든 경로 끝에 / 를 붙인다.
 *
 * 종료 코드: 0=실패 없음, 1=실패 있음, 2=서버에 접속할 수 없음
 */

// dev 서버는 첫 요청에서 해당 라우트를 컴파일하므로 콜드 스타트가 수십 초까지 걸린다.
// 짧은 타임아웃은 멀쩡한 라우트를 FAIL 로 만들어 FLAKY_FAILURE 를 양산한다.
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_ON_FAILURE = 1;
const CONCURRENCY = 4;

const argsSchema = z.object({
  base: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        return new URL(value).protocol.startsWith("http");
      } catch {
        return false;
      }
    }, "올바른 http(s) URL 이 아닙니다"),
  task: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9._-]+$/, "작업 id 는 영문·숫자와 . _ - 만 사용할 수 있습니다"),
  loopDir: z.string().min(1).nullable(),
  includeExternal: z.boolean(),
});

type SmokeArgs = z.infer<typeof argsSchema>;

function parseArgs(argv: string[]): SmokeArgs {
  const read = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
  };
  const result = argsSchema.safeParse({
    base: read("--base") ?? process.env.LOOP_SMOKE_BASE_URL ?? "http://localhost:3000",
    task: read("--task") ?? "smoke",
    loopDir: read("--loop-dir"),
    includeExternal: argv.includes("--include-external"),
  });
  if (!result.success) {
    const detail = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`[loop-smoke] 인자가 올바르지 않습니다 — ${detail}`);
  }
  return result.data;
}

function resolveRepoRoot(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  const top = result.status === 0 ? result.stdout.trim() : "";
  return top.length > 0 ? top : path.resolve(cwd, "..");
}

function listFiles(dir: string, fileName: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(full, fileName));
    } else if (entry.name === fileName) {
      found.push(full);
    }
  }
  return found;
}

interface RouteCandidate {
  route: string;
  filePath: string;
}

function discoverRoutes(appDir: string): RouteCandidate[] {
  const files = [...listFiles(appDir, "route.ts"), ...listFiles(appDir, "page.tsx")];
  const candidates = new Map<string, RouteCandidate>();
  for (const filePath of files) {
    const route = toRoutePath(appDir, filePath);
    if (route !== null) candidates.set(route, { route, filePath });
  }
  return [...candidates.values()].sort((a, b) => a.route.localeCompare(b.route));
}

function skipReason(candidate: RouteCandidate, includeExternal: boolean): string | null {
  if (isHardDenied(candidate.route)) {
    return "파괴적·예약 수집 라우트라 스모크에서 제외합니다";
  }
  if (includeExternal) return null;
  return usesPaidClient(fs.readFileSync(candidate.filePath, "utf8"))
    ? "실과금·외부 API 클라이언트를 사용합니다 (--include-external 로 포함)"
    : null;
}

async function attempt(base: string, route: string): Promise<{ status: number } | { error: string }> {
  try {
    const response = await fetch(new URL(route, base), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "text/html,application/json" },
    });
    return { status: response.status };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function probe(base: string, route: string): Promise<SmokeResult> {
  const startedAt = Date.now();
  let lastError = "알 수 없는 오류";
  // 콜드 컴파일과 실제 장애를 구분하기 위해 네트워크 실패는 한 번 더 시도한다.
  for (let tryIndex = 0; tryIndex <= RETRY_ON_FAILURE; tryIndex += 1) {
    const result = await attempt(base, route);
    if ("status" in result) {
      const { outcome, reason } = classifyStatus(result.status);
      return { route, outcome, status: result.status, durationMs: Date.now() - startedAt, reason };
    }
    lastError = result.error;
  }
  return {
    route,
    outcome: "FAIL",
    status: null,
    durationMs: Date.now() - startedAt,
    reason: `요청 실패 (${RETRY_ON_FAILURE + 1}회 시도, 각 ${REQUEST_TIMEOUT_MS / 1000}초): ${lastError}`,
  };
}

async function probeAll(base: string, routes: string[]): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, routes.length) }, async () => {
      for (;;) {
        const route = routes[cursor++];
        if (route === undefined) return;
        results.push(await probe(base, route));
      }
    })
  );
  return results.sort((a, b) => a.route.localeCompare(b.route));
}

async function isServerReachable(base: string): Promise<boolean> {
  try {
    await fetch(new URL("/", base), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

function printSummary(results: SmokeResult[], outputPath: string): void {
  const tally = new Map<SmokeOutcome, number>();
  for (const result of results) {
    tally.set(result.outcome, (tally.get(result.outcome) ?? 0) + 1);
  }
  console.log("\n[loop-smoke] 결과 요약");
  for (const [outcome, count] of [...tally.entries()].sort()) {
    console.log(`  ${outcome.padEnd(12)} ${count}개`);
  }
  for (const failure of results.filter((result) => result.outcome === "FAIL")) {
    console.log(`  FAIL ${failure.route} — ${failure.reason ?? "사유 없음"}`);
  }
  console.log(`\n[loop-smoke] 기록 → ${outputPath}`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const appDir = path.join(cwd, "src", "app");
  const loopDir = args.loopDir ?? path.join(resolveRepoRoot(cwd), ".loop");

  const candidates = discoverRoutes(appDir);
  if (candidates.length === 0) {
    throw new Error(`[loop-smoke] 라우트를 찾지 못했습니다: ${appDir}`);
  }

  if (!(await isServerReachable(args.base))) {
    console.error(`[loop-smoke] 서버에 접속할 수 없습니다: ${args.base} — dev 서버를 먼저 띄우세요.`);
    return 2;
  }

  const skippedResults: SmokeResult[] = [];
  const targets: string[] = [];
  for (const candidate of candidates) {
    const reason = skipReason(candidate, args.includeExternal);
    if (reason === null) {
      targets.push(candidate.route);
    } else {
      skippedResults.push({
        route: candidate.route,
        outcome: "SKIPPED",
        status: null,
        durationMs: 0,
        reason,
      });
    }
  }

  const probed = await probeAll(args.base, targets);
  const results = [...probed, ...skippedResults].sort((a, b) => a.route.localeCompare(b.route));
  const failures = results.filter((result) => result.outcome === "FAIL").length;

  const outputDir = path.join(loopDir, "validation");
  const outputPath = path.join(outputDir, `${args.task}.json`);
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(
        {
          base: args.base,
          finishedAt: new Date().toISOString(),
          discovered: candidates.length,
          probed: probed.length,
          skipped: skippedResults.length,
          failures,
          results,
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[loop-smoke] 결과를 저장하지 못했습니다 (${outputPath}): ${detail}`);
  }

  printSummary(results, outputPath);
  return failures > 0 ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
