// @TASK P2-A1-T1 - Invite-only workspace bootstrap CLI
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-가입과-운영자-cli
import { randomBytes as cryptoRandomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getDatabase, type SemforgeDatabase } from "@/db/client";
import { PostgresOperatorInviteStore } from "@/server/auth/postgres-store";
import type { CreateInviteInput } from "@/server/auth/schemas";
import { createAuthService } from "@/server/auth/service";
import {
  evaluateOperationalReleaseGate,
  type ReleaseTarget,
  RELEASE_TARGETS,
  ReleaseGateError,
} from "@/server/release/operational-gate";

import { getCurrentGitSha } from "./release-gate";

export interface InviteArguments {
  email: string;
  workspaceName: string;
  releaseTarget?: ReleaseTarget;
  releaseAttestationPath?: string;
}

export interface InviteCommandDependencies {
  now?: () => Date;
  randomBytes?: (size: number) => Uint8Array;
  createInvite?: (input: CreateInviteInput) => Promise<{ token: string; expiresAt: Date }>;
  currentGitSha?: () => string;
  readReleaseAttestation?: (path: string | undefined) => string | undefined;
  writeStdout?: (value: string) => void;
  writeStderr?: (value: string) => void;
}

const SUPPORTED_ARGUMENTS = new Set([
  "--email",
  "--workspace-name",
  "--release-target",
  "--release-attestation",
]);
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export class InviteUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteUsageError";
  }
}

export function parseInviteArgs(argv: readonly string[]): InviteArguments {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !SUPPORTED_ARGUMENTS.has(key)) {
      throw new InviteUsageError("지원하지 않는 인자입니다.");
    }
    if (value === undefined || value.startsWith("--")) {
      throw new InviteUsageError(`${key} 값이 필요합니다.`);
    }
    if (values.has(key)) {
      throw new InviteUsageError(`${key} 인자는 한 번만 사용할 수 있습니다.`);
    }
    values.set(key, value);
  }

  const email = (values.get("--email") ?? "").trim().toLowerCase();
  const workspaceName = (values.get("--workspace-name") ?? "")
    .trim()
    .replace(/\s+/gu, " ");
  const releaseTarget = values.get("--release-target")?.trim();
  const releaseAttestationPath = values.get("--release-attestation")?.trim();

  if (!email) throw new InviteUsageError("--email 값이 필요합니다.");
  if (
    email.length > 254 ||
    /\p{C}/u.test(email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    throw new InviteUsageError("유효한 --email 값을 입력하세요.");
  }
  if (!workspaceName) throw new InviteUsageError("--workspace-name 값이 필요합니다.");
  if (workspaceName.length > 100 || /\p{C}/u.test(workspaceName)) {
    throw new InviteUsageError("유효한 100자 이하의 --workspace-name 값을 입력하세요.");
  }
  if (releaseTarget !== undefined && !RELEASE_TARGETS.includes(releaseTarget as ReleaseTarget)) {
    throw new InviteUsageError(
      "--release-target 값은 sandbox, staging, paid-production 중 하나여야 합니다.",
    );
  }
  if (releaseAttestationPath !== undefined && !releaseAttestationPath.startsWith("/")) {
    throw new InviteUsageError("--release-attestation 경로는 절대 경로여야 합니다.");
  }
  const parsed: InviteArguments = {
    email,
    workspaceName,
  };
  if (releaseTarget !== undefined) parsed.releaseTarget = releaseTarget as ReleaseTarget;
  if (releaseAttestationPath !== undefined) parsed.releaseAttestationPath = releaseAttestationPath;
  return parsed;
}

function slugBase(workspaceName: string): string {
  const normalized = workspaceName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 47);
  return normalized || "workspace";
}

export function createWorkspaceSlug(
  workspaceName: string,
  randomBytes: (size: number) => Uint8Array = cryptoRandomBytes,
): string {
  const suffix = Buffer.from(randomBytes(12)).toString("hex");
  return `${slugBase(workspaceName)}-${suffix}`;
}

export type OperatorDatabaseFactory = (role: "operator") => SemforgeDatabase;

export async function createInviteThroughAuthService(
  input: CreateInviteInput,
  databaseFactory: OperatorDatabaseFactory = (role) => getDatabase(role),
): Promise<{ token: string; expiresAt: Date }> {
  const service = createAuthService({
    inviteStore: new PostgresOperatorInviteStore(databaseFactory("operator")),
  });
  return service.createInvite(input);
}

function defaultReleaseTarget(): ReleaseTarget {
  return process.env.NODE_ENV === "production" ? "paid-production" : "sandbox";
}

function readReleaseAttestationFromPath(path: string | undefined): string | undefined {
  const attestationPath = path ?? process.env.SEMFORGE_RELEASE_ATTESTATION_PATH;
  if (!attestationPath) return undefined;
  try {
    return readFileSync(attestationPath, "utf8");
  } catch {
    throw new ReleaseGateError(["release attestation manifest could not be read"]);
  }
}

function assertProductionRuntimeTarget(releaseTarget: ReleaseTarget): void {
  if (process.env.NODE_ENV === "production" && releaseTarget !== "paid-production") {
    throw new ReleaseGateError([
      "production runtime can only create paid-production invites with attestation",
    ]);
  }
}

// @TEST scripts/invite.test.ts
export async function runInvite(
  argv: readonly string[],
  dependencies: InviteCommandDependencies = {},
): Promise<number> {
  const now = dependencies.now ?? (() => new Date());
  const randomBytes = dependencies.randomBytes ?? cryptoRandomBytes;
  const createInvite = dependencies.createInvite ?? createInviteThroughAuthService;
  const writeStdout = dependencies.writeStdout ?? ((value: string) => process.stdout.write(value));
  const writeStderr = dependencies.writeStderr ?? ((value: string) => process.stderr.write(value));

  try {
    const args = parseInviteArgs(argv);
    const releaseTarget = args.releaseTarget ?? defaultReleaseTarget();
    assertProductionRuntimeTarget(releaseTarget);
    evaluateOperationalReleaseGate({
      releaseTarget,
      now: now(),
      currentGitSha:
        releaseTarget === "paid-production"
          ? (dependencies.currentGitSha ?? getCurrentGitSha)()
          : "0".repeat(40),
      manifestText:
        releaseTarget === "paid-production"
          ? (dependencies.readReleaseAttestation ?? readReleaseAttestationFromPath)(
              args.releaseAttestationPath,
            )
          : undefined,
    });
    const result = await createInvite({
      workspaceName: args.workspaceName,
      workspaceSlug: createWorkspaceSlug(args.workspaceName, randomBytes),
      email: args.email,
      releaseTarget,
    });
    if (!/^[A-Za-z0-9_-]{43}$/u.test(result.token)) {
      throw new Error("Auth service returned an invalid token.");
    }
    const verifiedAt = now();
    if (
      !(result.expiresAt instanceof Date) ||
      Number.isNaN(result.expiresAt.getTime()) ||
      result.expiresAt <= verifiedAt ||
      result.expiresAt.getTime() - verifiedAt.getTime() > INVITE_TTL_MS
    ) {
      throw new Error("Auth service returned an invalid invite expiration.");
    }
    writeStdout(`${result.token}\n`);
    return 0;
  } catch (error) {
    if (error instanceof InviteUsageError) {
      writeStderr(`사용법 오류: ${error.message}\n`);
      return 2;
    }
    if (error instanceof ReleaseGateError) {
      writeStderr("운영 유료 초대 release gate 검증에 실패했습니다.\n");
      return 1;
    }
    writeStderr("초대 생성에 실패했습니다.\n");
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runInvite(process.argv.slice(2));
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main();
}
