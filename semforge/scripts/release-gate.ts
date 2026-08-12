// @TASK P5-V1-T1 - Operational paid production release gate CLI
// @SPEC docs/release/operational-gate.md
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  evaluateOperationalReleaseGate,
  type ReleaseTarget,
  RELEASE_TARGETS,
  ReleaseGateError,
} from "@/server/release/operational-gate";

export interface ReleaseGateArguments {
  readonly releaseTarget: ReleaseTarget;
  readonly attestationPath?: string;
}

export interface ReleaseGateCommandDependencies {
  readonly now?: () => Date;
  readonly currentGitSha?: () => string;
  readonly readFile?: (path: string) => string;
  readonly writeStdout?: (value: string) => void;
  readonly writeStderr?: (value: string) => void;
}

const SUPPORTED_ARGUMENTS = new Set(["--release-target", "--attestation"]);

export class ReleaseGateUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseGateUsageError";
  }
}

export function parseReleaseGateArgs(argv: readonly string[]): ReleaseGateArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !SUPPORTED_ARGUMENTS.has(key)) {
      throw new ReleaseGateUsageError("지원하지 않는 인자입니다.");
    }
    if (value === undefined || value.startsWith("--")) {
      throw new ReleaseGateUsageError(`${key} 값이 필요합니다.`);
    }
    if (values.has(key)) {
      throw new ReleaseGateUsageError(`${key} 인자는 한 번만 사용할 수 있습니다.`);
    }
    values.set(key, value);
  }

  const releaseTarget = values.get("--release-target");
  if (!releaseTarget || !RELEASE_TARGETS.includes(releaseTarget as ReleaseTarget)) {
    throw new ReleaseGateUsageError("--release-target 값은 sandbox, staging, paid-production 중 하나여야 합니다.");
  }
  const attestationPath = values.get("--attestation")?.trim();
  if (releaseTarget === "paid-production" && !attestationPath) {
    throw new ReleaseGateUsageError("paid-production에는 --attestation 경로가 필요합니다.");
  }
  if (attestationPath !== undefined && !attestationPath.startsWith("/")) {
    throw new ReleaseGateUsageError("--attestation 경로는 절대 경로여야 합니다.");
  }

  return {
    releaseTarget: releaseTarget as ReleaseTarget,
    attestationPath,
  };
}

export function getCurrentGitSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function readAttestationFile(path: string, readFile: (path: string) => string): string {
  try {
    return readFile(path);
  } catch {
    throw new ReleaseGateError(["release attestation manifest could not be read"]);
  }
}

// @TEST scripts/release-gate.test.ts
export async function runReleaseGate(
  argv: readonly string[],
  dependencies: ReleaseGateCommandDependencies = {},
): Promise<number> {
  const writeStdout = dependencies.writeStdout ?? ((value: string) => process.stdout.write(value));
  const writeStderr = dependencies.writeStderr ?? ((value: string) => process.stderr.write(value));

  try {
    const args = parseReleaseGateArgs(argv);
    const manifestText =
      args.attestationPath === undefined
        ? undefined
        : readAttestationFile(
            args.attestationPath,
            dependencies.readFile ?? ((path: string) => readFileSync(path, "utf8")),
          );
    const decision = evaluateOperationalReleaseGate({
      releaseTarget: args.releaseTarget,
      now: (dependencies.now ?? (() => new Date()))(),
      currentGitSha:
        args.releaseTarget === "paid-production"
          ? (dependencies.currentGitSha ?? getCurrentGitSha)()
          : "0".repeat(40),
      manifestText,
    });
    writeStdout(`${JSON.stringify(decision)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof ReleaseGateUsageError) {
      writeStderr(`사용법 오류: ${error.message}\n`);
      return 2;
    }
    if (error instanceof ReleaseGateError) {
      writeStderr("운영 release gate 검증에 실패했습니다.\n");
      return 1;
    }
    writeStderr("운영 release gate 실행에 실패했습니다.\n");
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runReleaseGate(process.argv.slice(2));
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main();
}
